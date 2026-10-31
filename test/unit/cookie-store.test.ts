import { describe, expect, it } from "vitest";
import { MemoryCookieStore } from "../../src/core/cookies.js";

let t = 1_800_000_000_000;
const now = (): number => t;
const chat = new URL("https://chat.line.biz/api/v1/me");
const mgr = new URL("https://manager.line.biz/x");
const acc = new URL("https://account.line.biz/");

describe("MemoryCookieStore", () => {
  it("domain vs host-only", () => {
    const s = new MemoryCookieStore(
      [
        { name: "ses", value: "1", domain: ".line.biz" },
        { name: "__Host-chat-ses", value: "2", domain: "chat.line.biz", secure: true, path: "/" },
      ],
      { now },
    );
    expect(s.getCookieHeader(chat)).toBe("ses=1; __Host-chat-ses=2");
    expect(s.getCookieHeader(mgr)).toBe("ses=1");
  });

  it("does not send cookies to foreign hosts", () => {
    const s = new MemoryCookieStore([{ name: "a", value: "1", domain: ".line.biz" }], { now });
    expect(s.getCookieHeader(new URL("https://evil.com/"))).toBe("");
    expect(s.getCookieHeader(new URL("https://notline.biz/"))).toBe("");
  });

  it("secure only over https", () => {
    const s = new MemoryCookieStore(
      [{ name: "a", value: "1", domain: ".line.biz", secure: true }],
      { now },
    );
    expect(s.getCookieHeader(new URL("http://chat.line.biz/"))).toBe("");
    expect(s.getCookieHeader(chat)).toBe("a=1");
  });

  it("path matching and ordering", () => {
    const s = new MemoryCookieStore(
      [
        { name: "r", value: "1", domain: ".line.biz", path: "/" },
        { name: "p", value: "2", domain: ".line.biz", path: "/api" },
      ],
      { now },
    );
    expect(s.getCookieHeader(chat)).toBe("p=2; r=1");
    expect(s.getCookieHeader(new URL("https://chat.line.biz/apix"))).toBe("r=1");
    expect(s.getCookieHeader(new URL("https://chat.line.biz/api"))).toBe("p=2; r=1");
  });

  it("Set-Cookie upsert host-only with default path", () => {
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(new URL("https://chat.line.biz/api/v1/me"), ["XSRF-TOKEN=abc; Secure; HttpOnly"]);
    expect(s.toJSON()).toEqual([
      expect.objectContaining({
        name: "XSRF-TOKEN",
        value: "abc",
        domain: "chat.line.biz",
        path: "/api/v1",
        expires: -1,
        secure: true,
        httpOnly: true,
      }),
    ]);
  });

  it("default path falls back to / for shallow request paths", () => {
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(new URL("https://chat.line.biz/x"), ["a=1"]);
    s.setCookies(new URL("https://chat.line.biz/"), ["b=1"]);
    expect(s.toJSON().map((c) => c.path)).toEqual(["/", "/"]);
  });

  it("Set-Cookie replaces existing", () => {
    const s = new MemoryCookieStore(
      [{ name: "ses", value: "old", domain: ".line.biz", path: "/" }],
      { now },
    );
    s.setCookies(chat, ["ses=new; Domain=line.biz; Path=/"]);
    expect(s.getCookieHeader(acc)).toBe("ses=new");
    expect(s.toJSON()).toHaveLength(1);
  });

  it("Max-Age=0 deletes", () => {
    const s = new MemoryCookieStore(
      [{ name: "ses", value: "1", domain: ".line.biz", path: "/" }],
      { now },
    );
    s.setCookies(chat, ["ses=; Domain=.line.biz; Path=/; Max-Age=0"]);
    expect(s.getCookieHeader(chat)).toBe("");
    expect(s.toJSON()).toEqual([]);
  });

  it("Expires in the past deletes", () => {
    const s = new MemoryCookieStore(
      [{ name: "ses", value: "1", domain: ".line.biz", path: "/" }],
      { now },
    );
    s.setCookies(chat, ["ses=; Domain=line.biz; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
    expect(s.toJSON()).toEqual([]);
  });

  it("Expires in the future is stored in seconds", () => {
    const s = new MemoryCookieStore(undefined, { now });
    const at = new Date(t + 3_600_000);
    s.setCookies(chat, [`a=1; Path=/; Expires=${at.toUTCString()}`]);
    expect(s.toJSON()[0]?.expires).toBe(at.getTime() / 1000);
  });

  it("Max-Age wins over Expires", () => {
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(chat, ["a=1; Path=/; Max-Age=10; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
    expect(s.getCookieHeader(chat)).toBe("a=1");
  });

  it("expires over time", () => {
    t = 1_800_000_000_000;
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(chat, ["a=1; Path=/; Max-Age=10"]);
    expect(s.getCookieHeader(chat)).toBe("a=1");
    t += 11_000;
    expect(s.getCookieHeader(chat)).toBe("");
    expect(s.toJSON()).toEqual([]);
    t = 1_800_000_000_000;
  });

  it("rejects foreign Domain", () => {
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(chat, ["x=1; Domain=evil.com"]);
    s.setCookies(chat, ["y=1; Domain=manager.line.biz"]);
    s.setCookies(chat, ["z=1; Domain=biz"]);
    expect(s.toJSON()).toEqual([]);
  });

  it("__Host- rules", () => {
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(chat, [
      "__Host-a=1; Path=/",
      "__Host-b=1; Secure; Path=/; Domain=line.biz",
      "__Host-c=1; Secure; Path=/",
      "__Host-d=1; Secure; Path=/api",
    ]);
    expect(s.toJSON().map((c) => c.name)).toEqual(["__Host-c"]);
  });

  it("__Secure- requires Secure", () => {
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(chat, ["__Secure-a=1; Path=/", "__Secure-b=1; Secure; Path=/"]);
    expect(s.toJSON().map((c) => c.name)).toEqual(["__Secure-b"]);
  });

  it("ignores malformed Set-Cookie entries without throwing", () => {
    const s = new MemoryCookieStore(undefined, { now });
    expect(() => {
      s.setCookies(chat, ["", "novalue", "=x", " ; Path=/", "ok=1; Max-Age=abc; Expires=garbage"]);
    }).not.toThrow();
    expect(s.toJSON().map((c) => c.name)).toEqual(["ok"]);
  });

  it("attributes are case-insensitive and SameSite is normalized", () => {
    const s = new MemoryCookieStore(undefined, { now });
    s.setCookies(chat, ["a=1; DOMAIN=Line.Biz; PATH=/; SECURE; httponly; samesite=lax; MAX-AGE=60"]);
    expect(s.toJSON()).toEqual([
      {
        name: "a",
        value: "1",
        domain: ".line.biz",
        path: "/",
        expires: (t + 60_000) / 1000,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  it("compares hosts case-insensitively", () => {
    const s = new MemoryCookieStore([{ name: "a", value: "1", domain: ".LINE.biz" }], { now });
    expect(s.getCookieHeader(chat)).toBe("a=1");
  });

  it("toJSON round-trips into a new store", () => {
    const s = new MemoryCookieStore("a=1", { now });
    expect(new MemoryCookieStore(s.toJSON(), { now }).getCookieHeader(chat)).toBe("a=1");
  });

  it("toJSON marks domain cookies with a leading dot and host-only without", () => {
    const s = new MemoryCookieStore(
      [
        { name: "d", value: "1", domain: ".line.biz" },
        { name: "h", value: "2", domain: "chat.line.biz" },
      ],
      { now },
    );
    expect(s.toJSON().map((c) => c.domain)).toEqual([".line.biz", "chat.line.biz"]);
  });
});
