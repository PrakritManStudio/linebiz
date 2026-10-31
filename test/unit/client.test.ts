import { describe, expect, it } from "vitest";
import { LineBizClient } from "../../src/client.js";
import { ConfigError } from "../../src/core/errors.js";
import { MemoryCookieStore } from "../../src/core/cookies.js";
import { meFixture } from "../fixtures/me.js";
import { json, mockFetch } from "../helpers/mock-fetch.js";

describe("LineBizClient", () => {
  it("requires exactly one of cookies/cookieStore", () => {
    expect(() => new LineBizClient({})).toThrow(ConfigError);
    expect(
      () => new LineBizClient({ cookies: "a=1", cookieStore: new MemoryCookieStore("a=1") }),
    ).toThrow(ConfigError);
  });

  it.each([
    { timeout: 0 },
    { timeout: 1.5 },
    { timeout: 2_147_483_648 },
    { maxRetries: 11 },
    { maxRetries: -1 },
    { baseURLs: { chat: "not a url" } },
    { baseURLs: { chat: "ftp://example.com" } },
  ])("rejects bad option %o", (o) => {
    expect(() => new LineBizClient({ cookies: "a=1", ...o })).toThrow(ConfigError);
  });

  it("baseURLs override + custom fetch", async () => {
    const m = mockFetch(json(meFixture));
    await new LineBizClient({
      cookies: "a=1",
      fetch: m.fetch,
      baseURLs: { chat: "http://localhost:9999" },
    }).me.retrieve();
    expect(m.calls[0]!.url).toBe("http://localhost:9999/api/v1/me");
  });

  it("withOptions keeps cookie store and does not mutate original", async () => {
    const m = mockFetch(json(meFixture), json(meFixture));
    const c1 = new LineBizClient({ cookies: "a=1", fetch: m.fetch });
    const c2 = c1.withOptions({ headers: { "X-T": "1" } });
    await c2.me.retrieve();
    await c1.me.retrieve();
    expect(m.calls[0]!.headers.get("x-t")).toBe("1");
    expect(m.calls[1]!.headers.has("x-t")).toBe(false);
    expect(m.calls[1]!.headers.get("cookie")).toBe("a=1");
  });

  it("withOptions shares the cookie store with the original", async () => {
    const m = mockFetch(
      json(meFixture, { headers: { "set-cookie": "b=2; Domain=.line.biz; Path=/" } }),
      json(meFixture),
    );
    const c1 = new LineBizClient({ cookies: "a=1", fetch: m.fetch });
    await c1.me.retrieve();
    await c1.withOptions({ timeout: 5_000 }).me.retrieve();
    expect(m.calls[1]!.headers.get("cookie")).toContain("b=2");
  });

  it("exportCookies", async () => {
    expect(await new LineBizClient({ cookies: "a=1" }).exportCookies()).toEqual([
      expect.objectContaining({ name: "a", value: "1" }),
    ]);
    await expect(
      new LineBizClient({ cookieStore: { getCookieHeader: () => "" } }).exportCookies(),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
