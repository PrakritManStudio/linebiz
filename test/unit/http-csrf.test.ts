import { describe, expect, it } from "vitest";
import {
  APIError,
  AbortError,
  ConfigError,
  PermissionDeniedError,
  UnexpectedResponseError,
} from "../../src/core/errors.js";
import type { ErrorContext, RequestContext } from "../../src/core/http.js";
import { client } from "../helpers/client.js";
import { make } from "../helpers/make-http.js";
import { json, mockFetch } from "../helpers/mock-fetch.js";

const POST = { service: "chat", method: "POST", path: "/api/v1/things", body: { a: 1 } } as const;
const TOKEN_PATH = "/api/v1/csrfToken";

const csrf = (token: string, headerName = "X-XSRF-TOKEN"): Response =>
  json({ headerName, parameterName: "_csrf", token });
const forbidden = (): Response =>
  json(
    { timestamp: "2026-11-01T00:00:00.000+00:00", status: 403, error: "Forbidden", path: "/x" },
    { status: 403 },
  );
const summary = (calls: Request[]): string[] =>
  calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);

describe("automatic CSRF token", () => {
  it("fetches the token once and reuses it for later writes", async () => {
    const m = mockFetch(csrf("tok-1"), json({ ok: 1 }), json({ ok: 2 }));
    const http = make({ fetch: m.fetch });
    await http.request(POST);
    await http.request(POST);
    expect(summary(m.calls)).toEqual([
      `GET ${TOKEN_PATH}`,
      "POST /api/v1/things",
      "POST /api/v1/things",
    ]);
    expect(m.calls[1]!.headers.get("x-xsrf-token")).toBe("tok-1");
    expect(m.calls[2]!.headers.get("x-xsrf-token")).toBe("tok-1");
    expect(m.calls[0]!.headers.has("x-xsrf-token")).toBe(false);
    expect(m.calls[0]!.headers.get("cookie")).toBe("ses=S");
  });

  it("never fetches a token for GET, non-chat services or absolute URLs", async () => {
    const m = mockFetch(json({}), json({}), new Response(null, { status: 302 }));
    const http = make({ fetch: m.fetch });
    await http.request({ service: "chat", method: "GET", path: "/x" });
    await http.request({ service: "account", method: "POST", path: "/x" });
    await http.request({
      service: "chat",
      method: "POST",
      path: "",
      absoluteURL: "https://account.line.biz/logout",
      allowRedirect: true,
    });
    expect(m.calls).toHaveLength(3);
    for (const call of m.calls) {
      expect(new URL(call.url).pathname).not.toBe(TOKEN_PATH);
      expect(call.headers.has("x-xsrf-token")).toBe(false);
    }
  });

  it("honours a custom header name from the response", async () => {
    const m = mockFetch(csrf("tok-c", "X-Custom-Csrf"), json({}));
    await make({ fetch: m.fetch }).request(POST);
    expect(m.calls[1]!.headers.get("x-custom-csrf")).toBe("tok-c");
    expect(m.calls[1]!.headers.has("x-xsrf-token")).toBe(false);
  });

  it("refetches on 403 and resends the write once with the new token", async () => {
    const m = mockFetch(csrf("old"), forbidden(), csrf("new"), json({ ok: true }));
    const result = await make({ fetch: m.fetch }).request<{ ok: boolean }>(POST);
    expect(result).toEqual({ ok: true });
    expect(summary(m.calls)).toEqual([
      `GET ${TOKEN_PATH}`,
      "POST /api/v1/things",
      `GET ${TOKEN_PATH}`,
      "POST /api/v1/things",
    ]);
    expect(m.calls[1]!.headers.get("x-xsrf-token")).toBe("old");
    expect(m.calls[3]!.headers.get("x-xsrf-token")).toBe("new");
    expect(await m.calls[3]!.json()).toEqual({ a: 1 });
  });

  it("resends even when maxRetries is 0 and numbers the write attempts", async () => {
    const m = mockFetch(csrf("old"), forbidden(), csrf("new"), json({}));
    const writes: number[] = [];
    await make({
      fetch: m.fetch,
      maxRetries: 0,
      hooks: {
        onRequest: (ctx: RequestContext) => {
          if (ctx.method === "POST") writes.push(ctx.attempt);
        },
      },
    }).request(POST);
    expect(writes).toEqual([0, 1]);
  });

  it("rejects with PermissionDeniedError after a second 403 and reports onError once", async () => {
    const m = mockFetch(csrf("old"), forbidden(), csrf("new"), forbidden());
    const errors: ErrorContext[] = [];
    const http = make({ fetch: m.fetch, hooks: { onError: (ctx) => void errors.push(ctx) } });
    await expect(http.request(POST)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(m.calls.filter((c) => c.method === "POST")).toHaveLength(2);
    expect(m.calls).toHaveLength(4);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toBeInstanceOf(PermissionDeniedError);
  });

  it("does not resend for non-403 failures", async () => {
    const m = mockFetch(csrf("t"), json({ code: "x" }, { status: 400 }));
    await expect(make({ fetch: m.fetch }).request(POST)).rejects.toBeInstanceOf(APIError);
    expect(m.calls).toHaveLength(2);
  });

  it.each([
    ["missing token", () => json({ headerName: "X-XSRF-TOKEN" })],
    ["missing headerName", () => json({ token: "t" })],
    ["non-string token", () => json({ headerName: "X-XSRF-TOKEN", token: 5 })],
    ["null body", () => json(null)],
  ])("rejects a %s token response and never sends the write", async (_name, bad) => {
    const m = mockFetch(bad());
    const err: unknown = await make({ fetch: m.fetch })
      .request(POST)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnexpectedResponseError);
    expect((err as Error).message).toBe("Invalid CSRF token response");
    expect(m.calls).toHaveLength(1);
  });

  it("rejects a non-JSON token response and never sends the write", async () => {
    const m = mockFetch(new Response("<html>", { status: 200 }));
    await expect(make({ fetch: m.fetch }).request(POST)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(m.calls).toHaveLength(1);
  });

  it("clears the cache after a failed fetch so the next write fetches again", async () => {
    const m = mockFetch(json({}, { status: 500 }), csrf("t"), json({ ok: 1 }));
    const http = make({ fetch: m.fetch });
    await expect(http.request(POST)).rejects.toBeInstanceOf(APIError);
    await http.request(POST);
    expect(m.calls.map((c) => c.method)).toEqual(["GET", "GET", "POST"]);
  });

  it("reports a failed token fetch to onError only once", async () => {
    const m = mockFetch(json({}, { status: 500 }));
    const errors: ErrorContext[] = [];
    const http = make({ fetch: m.fetch, hooks: { onError: (ctx) => void errors.push(ctx) } });
    await expect(http.request(POST)).rejects.toBeInstanceOf(APIError);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.method).toBe("POST");
    expect(errors[0]!.url).toContain("/api/v1/things");
  });

  it("gives each concurrent writer one onError with its own write context when the token fetch fails", async () => {
    const m = mockFetch(json({}, { status: 500 }));
    const errors: ErrorContext[] = [];
    const http = make({ fetch: m.fetch, hooks: { onError: (ctx) => void errors.push(ctx) } });
    const results = await Promise.allSettled([http.request(POST), http.request(POST)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(m.calls).toHaveLength(1);
    expect(errors).toHaveLength(2);
    for (const ctx of errors) {
      expect(ctx.method).toBe("POST");
      expect(ctx.url).toContain("/api/v1/things");
    }
  });

  it("does not report an onRequest hook error as an onError event", async () => {
    const m = mockFetch();
    const errors: ErrorContext[] = [];
    const boom = new Error("hook");
    const http = make({
      fetch: m.fetch,
      hooks: {
        onRequest: () => {
          throw boom;
        },
        onError: (ctx) => void errors.push(ctx),
      },
    });
    await expect(http.request(POST)).rejects.toBe(boom);
    expect(errors).toHaveLength(0);
  });

  it("uses a client-level X-XSRF-TOKEN header (any case) without fetching a token", async () => {
    const m = mockFetch(json({}));
    await make({ fetch: m.fetch, headers: { "X-Xsrf-Token": "mine" } }).request(POST);
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.headers.get("x-xsrf-token")).toBe("mine");
  });

  it("uses a per-request x-xsrf-token header (any case) without fetching a token", async () => {
    const m = mockFetch(json({}));
    await make({ fetch: m.fetch }).request(POST, { headers: { "x-XSRF-token": "mine" } });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.headers.get("x-xsrf-token")).toBe("mine");
  });

  it("does not resend a 403 when the caller supplied the token", async () => {
    const m = mockFetch(forbidden());
    const http = make({ fetch: m.fetch, headers: { "X-XSRF-TOKEN": "mine" } });
    await expect(http.request(POST)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(m.calls).toHaveLength(1);
  });

  it("fetches the token once for concurrent writes", async () => {
    const m = mockFetch(csrf("tok"), json({ n: 1 }), json({ n: 2 }));
    const http = make({ fetch: m.fetch });
    await Promise.all([http.request(POST), http.request(POST)]);
    expect(m.calls.filter((c) => new URL(c.url).pathname === TOKEN_PATH)).toHaveLength(1);
    expect(m.calls).toHaveLength(3);
  });

  it("never exposes the token in hook contexts or error headers", async () => {
    const secret = "SECRET-CSRF-VALUE";
    const m = mockFetch(
      csrf(secret),
      json({}, { status: 400, headers: { "x-xsrf-token": secret } }),
    );
    const seen: string[] = [];
    const http = make({
      fetch: m.fetch,
      hooks: {
        onRequest: (ctx) => void seen.push(JSON.stringify(ctx)),
        onResponse: (ctx) => void seen.push(JSON.stringify(ctx)),
        onError: (ctx) => void seen.push(JSON.stringify(ctx)),
      },
    });
    const err: unknown = await http.request(POST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(m.calls[1]!.headers.get("x-xsrf-token")).toBe(secret);
    expect(seen.length).toBeGreaterThan(0);
    for (const entry of seen) expect(entry).not.toContain(secret);
    expect(JSON.stringify((err as APIError).headers)).not.toContain(secret);
    expect(String(err)).not.toContain(secret);
  });

  it("redacts a custom CSRF header name in hook contexts", async () => {
    const secret = "SECRET-CUSTOM";
    const m = mockFetch(csrf(secret, "X-Custom-Csrf"), json({}));
    const seen: string[] = [];
    await make({
      fetch: m.fetch,
      hooks: { onRequest: (ctx) => void seen.push(JSON.stringify(ctx)) },
    }).request(POST);
    expect(m.calls[1]!.headers.get("x-custom-csrf")).toBe(secret);
    for (const entry of seen) expect(entry).not.toContain(secret);
  });

  it("redacts a custom CSRF header in the onError context when the call fails before the attempt builds it", async () => {
    const secret = "SECRET-PRE-ATTEMPT";
    const m = mockFetch(csrf(secret, "X-Custom-Csrf"), json({}));
    let cookieCalls = 0;
    const errors: ErrorContext[] = [];
    const http = make({
      fetch: m.fetch,
      cookieStore: { getCookieHeader: () => (++cookieCalls <= 2 ? "ses=S" : "a=1\nb") },
      hooks: { onError: (ctx) => void errors.push(ctx) },
    });
    await http.request(POST);
    await expect(http.request(POST)).rejects.toBeInstanceOf(ConfigError);
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0])).not.toContain(secret);
    expect(errors[0]!.headers["X-Custom-Csrf"] ?? errors[0]!.headers["x-custom-csrf"]).toBe(
      "[REDACTED]",
    );
  });

  it("redacts a cached custom CSRF token when the signal is already aborted", async () => {
    const secret = "SECRET-ABORTED";
    const m = mockFetch(csrf(secret, "X-Custom-Csrf"), json({}));
    const errors: ErrorContext[] = [];
    const http = make({ fetch: m.fetch, hooks: { onError: (ctx) => void errors.push(ctx) } });
    await http.request(POST);
    const ac = new AbortController();
    ac.abort();
    await expect(http.request(POST, { signal: ac.signal })).rejects.toBeInstanceOf(AbortError);
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0])).not.toContain(secret);
  });

  describe("shared token fetch and caller signals", () => {
    const gated = (): { release: () => void; responder: (req: Request) => Promise<Response> } => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        release,
        // Like a real fetch, give up when the request signal fires.
        responder: (req: Request) =>
          new Promise<Response>((resolve, reject) => {
            req.signal.addEventListener(
              "abort",
              () => {
                reject(req.signal.reason as Error);
              },
              { once: true },
            );
            void gate.then(() => {
              resolve(csrf("tok"));
            });
          }),
      };
    };
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

    it("does not fail writer B when only writer A aborts during the shared fetch", async () => {
      const g = gated();
      const m = mockFetch(g.responder, json({ ok: true }));
      const http = make({ fetch: m.fetch });
      const acA = new AbortController();
      const a = http.request(POST, { signal: acA.signal });
      const b = http.request<{ ok: boolean }>(POST);
      const aResult = a.catch((e: unknown) => e);
      await tick();
      acA.abort();
      expect(await aResult).toBeInstanceOf(AbortError);
      g.release();
      expect(await b).toEqual({ ok: true });
      expect(m.calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    });

    it("rejects waiter B promptly with AbortError while A still succeeds", async () => {
      const g = gated();
      const m = mockFetch(g.responder, json({ ok: true }));
      const http = make({ fetch: m.fetch });
      const a = http.request<{ ok: boolean }>(POST);
      const acB = new AbortController();
      const b = http.request(POST, { signal: acB.signal });
      await tick();
      acB.abort();
      await expect(b).rejects.toBeInstanceOf(AbortError);
      g.release();
      expect(await a).toEqual({ ok: true });
      expect(m.calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    });

    it("is not cut short by a short per-call timeout of the first writer", async () => {
      const g = gated();
      const m = mockFetch(g.responder, json({ ok: true }));
      const http = make({ fetch: m.fetch });
      const a = http.request<{ ok: boolean }>(POST, { timeout: 5 });
      await new Promise((resolve) => setTimeout(resolve, 30));
      g.release();
      expect(await a).toEqual({ ok: true });
    });
  });

  it("refetches the token after auth.logout() clears the cache", async () => {
    const m = mockFetch(
      csrf("tok-1"),
      json({ logoutUri: "https://account.line.biz/logout" }),
      new Response(null, { status: 302, headers: { location: "https://access.line.me/" } }),
      csrf("tok-2"),
      json({}),
    );
    const c = client(m);
    await c.auth.logout();
    await c._http.request(POST);
    expect(m.calls.map((call) => new URL(call.url).pathname)).toEqual([
      TOKEN_PATH,
      "/api/v1/logoutUri",
      "/logout",
      TOKEN_PATH,
      "/api/v1/things",
    ]);
    expect(m.calls[4]!.headers.get("x-xsrf-token")).toBe("tok-2");
  });
});
