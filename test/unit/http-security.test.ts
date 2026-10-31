import { describe, expect, it } from "vitest";
import { LineBizClient } from "../../src/client.js";
import { ConfigError, ValidationError, isLineBizError } from "../../src/core/errors.js";
import type { CookieStore } from "../../src/core/cookies.js";
import { make } from "../helpers/make-http.js";
import { json, mockFetch } from "../helpers/mock-fetch.js";

const GET = { service: "chat", method: "GET", path: "/" } as const;
const SECRET = "SECRET123";

/** Assert that nothing observable on `err` contains `secret`. */
function expectNoLeak(err: unknown, secret: string = SECRET): void {
  expect(isLineBizError(err)).toBe(true);
  const e = err as Error;
  expect(e.message).not.toContain(secret);
  expect(String(e)).not.toContain(secret);
  expect(e.cause).toBeUndefined();
  expect(JSON.stringify(e, Object.getOwnPropertyNames(e))).not.toContain(secret);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected promise to reject");
}

function throwing(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}

describe("malformed cookie values never leak", () => {
  it("header-string cookies with a newline are a ConfigError at construction", () => {
    const err = throwing(() => new LineBizClient({ cookies: `ses=${SECRET}\nother=x` }));
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).code).toBe("INVALID_COOKIE");
    expectNoLeak(err);
  });

  it("JSON cookies with a newline are a ConfigError at construction", () => {
    const err = throwing(
      () =>
        new LineBizClient({ cookies: JSON.stringify([{ name: "ses", value: `${SECRET}\r\nx` }]) }),
    );
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).code).toBe("INVALID_COOKIE");
    expectNoLeak(err);
  });

  it("a custom store returning an invalid Cookie header rejects with ConfigError and reaches onError", async () => {
    const store: CookieStore = { getCookieHeader: () => `a=${SECRET}\nb` };
    const m = mockFetch();
    const seen: unknown[] = [];
    const err = await rejection(
      make({
        fetch: m.fetch,
        cookieStore: store,
        hooks: {
          onError: (c) => {
            seen.push(c.error);
          },
        },
      }).request(GET),
    );
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).code).toBe("INVALID_COOKIE");
    expectNoLeak(err);
    expect(seen).toEqual([err]);
    expect(m.calls).toHaveLength(0);
  });

  it("the same failure through LineBizClient rejects (does not throw synchronously)", async () => {
    const client = new LineBizClient({
      cookieStore: { getCookieHeader: () => `a=${SECRET}\nb` },
      fetch: mockFetch().fetch,
    });
    const err = await rejection(client.me.retrieve());
    expect(err).toBeInstanceOf(ConfigError);
    expectNoLeak(err);
  });
});

describe("user headers", () => {
  const BAD = `x${SECRET}\ny`;

  it("client headers with an invalid value throw ConfigError naming the header only", () => {
    const err = throwing(() => new LineBizClient({ cookies: "a=1", headers: { "X-Token": BAD } }));
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain("X-Token");
    expectNoLeak(err);
  });

  it("client headers with an invalid name throw ConfigError", () => {
    const err = throwing(() => new LineBizClient({ cookies: "a=1", headers: { "bad name": "v" } }));
    expect(err).toBeInstanceOf(ConfigError);
  });

  it("per-request headers with an invalid value reject with ValidationError naming the header", async () => {
    const m = mockFetch();
    const seen: unknown[] = [];
    const err = await rejection(
      make({
        fetch: m.fetch,
        hooks: {
          onError: (c) => {
            seen.push(c.error);
          },
        },
      }).request(GET, { headers: { "X-Token": BAD } }),
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain("X-Token");
    expect(JSON.stringify((err as ValidationError).value ?? null)).not.toContain(SECRET);
    expectNoLeak(err);
    expect(seen).toEqual([err]);
    expect(m.calls).toHaveLength(0);
  });

  it("per-request header failure through the client rejects", async () => {
    const client = new LineBizClient({ cookies: "a=1", fetch: mockFetch().fetch });
    const err = await rejection(client.me.retrieve({ headers: { "X-Token": BAD } }));
    expect(err).toBeInstanceOf(ValidationError);
    expectNoLeak(err);
  });

  it("a Cookie header is refused in client headers (any case)", () => {
    const err = throwing(() => new LineBizClient({ cookies: "a=1", headers: { cOoKiE: "x=1" } }));
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toMatch(/cookie/i);
  });

  it("a Cookie header is refused in per-request headers (any case)", async () => {
    const m = mockFetch();
    const err = await rejection(
      make({ fetch: m.fetch }).request(GET, { headers: { Cookie: "x=1" } }),
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(m.calls).toHaveLength(0);
  });

  it("withOptions validates headers too", () => {
    const client = new LineBizClient({ cookies: "a=1" });
    expect(() => client.withOptions({ headers: { cookie: "x=1" } })).toThrow(ConfigError);
  });
});

describe("custom fetch compatibility", () => {
  it("tolerates response headers without getSetCookie", async () => {
    const fetchImpl: typeof globalThis.fetch = () => {
      const res = json({ ok: 1 });
      Object.defineProperty(res, "headers", {
        value: { get: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() },
      });
      return Promise.resolve(res);
    };
    await expect(make({ fetch: fetchImpl }).request(GET)).resolves.toEqual({ ok: 1 });
  });
});

describe("hook redaction", () => {
  it("onResponse redacts set-cookie in responseHeaders", async () => {
    const seen: Record<string, string>[] = [];
    const m = mockFetch(json({}, { headers: { "set-cookie": `rot=${SECRET}; Path=/` } }));
    await make({
      fetch: m.fetch,
      hooks: {
        onResponse: (c) => {
          seen.push(c.responseHeaders);
        },
      },
    }).request(GET);
    expect(seen).toHaveLength(1);
    expect(seen[0]!["set-cookie"]).toBe("[REDACTED]");
    expect(JSON.stringify(seen)).not.toContain(SECRET);
  });

  it("ErrorContext.headers.cookie is redacted after a 401", async () => {
    const seen: Record<string, string>[] = [];
    const m = mockFetch(json({ code: "not_login" }, { status: 401 }));
    await make({
      fetch: m.fetch,
      hooks: {
        onError: (c) => {
          seen.push(c.headers);
        },
      },
    })
      .request(GET)
      .catch(() => undefined);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.cookie).toBe("[REDACTED]");
  });
});
