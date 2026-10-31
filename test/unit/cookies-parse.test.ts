import { describe, expect, it } from "vitest";
import { parseCookieInput } from "../../src/core/cookies.js";
import { ConfigError } from "../../src/core/errors.js";

const NOW = 1_800_000_000_000;

describe("parseCookieInput", () => {
  it("header string", () => {
    expect(parseCookieInput("a=1; b=x=y", NOW)).toEqual([
      { name: "a", value: "1", domain: ".line.biz", path: "/" },
      { name: "b", value: "x=y", domain: ".line.biz", path: "/" },
    ]);
  });

  it("rejects pair without =", () => {
    expect(() => parseCookieInput("a=1; junk", NOW)).toThrow(/position 1/);
  });

  it("playwright array filters non line.biz", () => {
    expect(
      parseCookieInput(
        [
          { name: "s", value: "1", domain: "chat.line.biz" },
          { name: "g", value: "2", domain: "www.google.com" },
        ],
        NOW,
      ).map((c) => c.name),
    ).toEqual(["s"]);
  });

  it("JSON string (legacy format)", () => {
    expect(
      parseCookieInput(
        JSON.stringify([{ name: "ses", value: "v", domain: ".line.biz", expires: -1 }]),
        NOW,
      ),
    ).toHaveLength(1);
  });

  it("bad JSON", () => {
    expect(() => parseCookieInput("[{", NOW)).toThrow(/Invalid cookies JSON/);
  });

  it("bad JSON error does not echo the input", () => {
    try {
      parseCookieInput('[{"name":"secretvalue123"', NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain("secretvalue123");
      expect((e as ConfigError).code).toBe("INVALID_COOKIE");
      expect((e as Error).cause).toBeUndefined();
    }
  });

  it("points at bad element", () => {
    expect(() => parseCookieInput([{ name: "a", value: 1 }], NOW)).toThrow(
      "cookies[0].value must be a string",
    );
  });

  it("Cookie-Editor export", () => {
    const out = parseCookieInput(
      [
        {
          domain: "chat.line.biz",
          expirationDate: 1_900_000_000,
          hostOnly: true,
          httpOnly: true,
          name: "__Host-chat-ses",
          path: "/",
          sameSite: "lax",
          secure: true,
          session: false,
          storeId: "0",
          value: "v",
        },
        {
          domain: ".line.biz",
          hostOnly: false,
          name: "ses",
          sameSite: "no_restriction",
          value: "w",
          session: true,
        },
      ],
      NOW,
    );
    expect(out[0]).toEqual({
      name: "__Host-chat-ses",
      value: "v",
      domain: "chat.line.biz",
      path: "/",
      expires: 1_900_000_000,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    expect(out[1]?.sameSite).toBe("None");
    expect(out[1]?.domain).toBe(".line.biz");
    expect(out[1]).not.toHaveProperty("expires");
  });

  it("hostOnly toggles the leading dot on the domain", () => {
    const out = parseCookieInput(
      [
        { name: "a", value: "1", domain: ".chat.line.biz", hostOnly: true },
        { name: "b", value: "2", domain: "chat.line.biz", hostOnly: false },
      ],
      NOW,
    );
    expect(out.map((c) => c.domain)).toEqual(["chat.line.biz", ".chat.line.biz"]);
  });

  it("drops unspecified sameSite", () => {
    const out = parseCookieInput(
      [{ name: "a", value: "1", domain: ".line.biz", sameSite: "unspecified" }],
      NOW,
    );
    expect(out[0]).not.toHaveProperty("sameSite");
  });

  it("drops expired cookies", () => {
    expect(
      parseCookieInput(
        [
          { name: "old", value: "1", domain: ".line.biz", expires: 1 },
          { name: "ok", value: "2", domain: ".line.biz" },
        ],
        NOW,
      ).map((c) => c.name),
    ).toEqual(["ok"]);
  });

  it("keeps cookies expiring in the future", () => {
    const out = parseCookieInput(
      [{ name: "a", value: "1", domain: ".line.biz", expires: NOW / 1000 + 10 }],
      NOW,
    );
    expect(out).toHaveLength(1);
  });

  it("does not match look-alike domains", () => {
    expect(() =>
      parseCookieInput([{ name: "a", value: "1", domain: "evilline.biz" }], NOW),
    ).toThrow(/No cookies/);
  });

  it("throws when nothing left", () => {
    expect(() => parseCookieInput([{ name: "g", value: "1", domain: "google.com" }], NOW)).toThrow(
      /No cookies/,
    );
  });

  it("rejects other types", () => {
    expect(() => parseCookieInput(42, NOW)).toThrow(ConfigError);
  });

  it("uses INVALID_COOKIE for parse errors", () => {
    try {
      parseCookieInput(42, NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as ConfigError).code).toBe("INVALID_COOKIE");
    }
  });

  it("error never contains cookie value", () => {
    expect(() => parseCookieInput("secretvalue123", NOW)).toThrow(ConfigError);
    try {
      parseCookieInput("secretvalue123", NOW);
    } catch (e) {
      expect((e as Error).message).not.toContain("secretvalue123");
    }
  });
});
