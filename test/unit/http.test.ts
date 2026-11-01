import { describe, expect, it } from "vitest";
import { MemoryCookieStore } from "../../src/core/cookies.js";
import {
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  UnexpectedResponseError,
} from "../../src/core/errors.js";
import { buildURL } from "../../src/core/http.js";
import { DEFAULT_CLIENT_VERSION, isAllowedAbsoluteURL } from "../../src/core/services.js";
import { make } from "../helpers/make-http.js";
import { json, mockFetch } from "../helpers/mock-fetch.js";

const GET_CHAT = { service: "chat", method: "GET", path: "/" } as const;

describe("buildURL", () => {
  it("encodes and joins arrays", () => {
    expect(
      buildURL("https://chat.line.biz", "/api/v2/bots/B/chats", {
        tagIds: ["a", "b c"],
        next: "x&y",
        skip: undefined,
      }).toString(),
    ).toBe("https://chat.line.biz/api/v2/bots/B/chats?tagIds=a%2Cb+c&next=x%26y");
  });
  it("stringifies numbers and booleans", () => {
    expect(buildURL("https://chat.line.biz", "/p", { n: 3, b: false }).search).toBe("?n=3&b=false");
  });
});

describe("isAllowedAbsoluteURL", () => {
  it.each([
    ["https://line.biz/", true],
    ["https://chat.line.biz/x", true],
    ["https://access.line.me/oauth", true],
    ["https://line.me/", true],
    ["http://chat.line.biz/", false],
    ["https://evilline.biz/", false],
    ["https://line.biz.evil.example/", false],
    ["https://evil.example/", false],
  ])("%s -> %s", (u, ok) => {
    expect(isAllowedAbsoluteURL(new URL(u))).toBe(ok);
  });
});

describe("HttpClient.request", () => {
  it("resolves base URL per service and sends chat headers", async () => {
    const m = mockFetch(json({ ok: 1 }));
    await make({ fetch: m.fetch }).request({ service: "chat", method: "GET", path: "/api/v1/me" });
    const r = m.calls[0]!;
    expect(r.url).toBe("https://chat.line.biz/api/v1/me");
    expect(r.headers.get("x-oa-chat-client-version")).toBe(DEFAULT_CLIENT_VERSION);
    expect(r.headers.get("cookie")).toBe("ses=S");
  });

  it("returns the parsed JSON body", async () => {
    const m = mockFetch(json({ ok: 1 }));
    await expect(make({ fetch: m.fetch }).request(GET_CHAT)).resolves.toEqual({ ok: 1 });
  });

  it("no chat client-version header for manager", async () => {
    const m = mockFetch(json({}));
    await make({ fetch: m.fetch }).request({ service: "manager", method: "GET", path: "/x" });
    expect(m.calls[0]!.headers.has("x-oa-chat-client-version")).toBe(false);
  });

  it("header precedence default < client < request", async () => {
    const m = mockFetch(json({}));
    await make({ fetch: m.fetch, headers: { "User-Agent": "client", "X-A": "1" } }).request(
      GET_CHAT,
      { headers: { "X-A": "2" } },
    );
    expect(m.calls[0]!.headers.get("user-agent")).toBe("client");
    expect(m.calls[0]!.headers.get("x-a")).toBe("2");
  });

  it("POST sends JSON body", async () => {
    const m = mockFetch(json({}));
    await make({ fetch: m.fetch, headers: { "X-XSRF-TOKEN": "t" } }).request({
      service: "chat",
      method: "POST",
      path: "/p",
      body: { a: 1 },
    });
    expect(await m.calls[0]!.json()).toEqual({ a: 1 });
    expect(m.calls[0]!.headers.get("content-type")).toBe("application/json");
  });

  it("omits Cookie when the store is empty", async () => {
    const m = mockFetch(json({}));
    await make({ fetch: m.fetch, cookieStore: { getCookieHeader: () => "" } }).request(GET_CHAT);
    expect(m.calls[0]!.headers.has("cookie")).toBe(false);
  });

  it("passes the abort signal through to fetch", async () => {
    const m = mockFetch(json({}));
    const ac = new AbortController();
    await make({ fetch: m.fetch }).request(GET_CHAT, { signal: ac.signal });
    ac.abort();
    expect(m.calls[0]!.signal.aborted).toBe(true);
  });

  it("maps 401 not_login", async () => {
    const m = mockFetch(json({ code: "not_login" }, { status: 401 }));
    await expect(make({ fetch: m.fetch }).request(GET_CHAT)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
      status: 401,
    });
  });

  it("keeps non-JSON error bodies as text", async () => {
    const m = mockFetch(new Response("boom", { status: 500 }));
    await expect(make({ fetch: m.fetch }).request(GET_CHAT)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      body: "boom",
    });
  });

  it("network failure -> ConnectionError", async () => {
    const cause = new TypeError("fetch failed");
    const m = mockFetch(() => {
      throw cause;
    });
    const err: unknown = await make({ fetch: m.fetch })
      .request(GET_CHAT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectionError);
    expect((err as ConnectionError).cause).toBe(cause);
  });

  // Review Focus 1
  it("does not follow 3xx and reports location", async () => {
    const m = mockFetch(
      new Response(null, { status: 302, headers: { location: "https://evil.example/login" } }),
    );
    await expect(make({ fetch: m.fetch }).request(GET_CHAT)).rejects.toMatchObject({
      code: "UNEXPECTED_RESPONSE",
      status: 302,
      location: "https://evil.example/login",
    });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.redirect).toBe("manual");
  });

  it("allowRedirect resolves undefined on 3xx", async () => {
    const m = mockFetch(new Response(null, { status: 302, headers: { location: "/" } }));
    await expect(
      make({ fetch: m.fetch }).request({
        service: "account",
        method: "GET",
        path: "/",
        allowRedirect: true,
      }),
    ).resolves.toBeUndefined();
  });

  // Review Focus 2
  it("stores Set-Cookie even on error responses", async () => {
    const store = new MemoryCookieStore("ses=S");
    const m = mockFetch(
      new Response("{}", {
        status: 401,
        headers: [["set-cookie", "ses=; Domain=line.biz; Path=/; Max-Age=0"]],
      }),
    );
    await expect(
      make({ fetch: m.fetch, cookieStore: store }).request(GET_CHAT),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(store.getCookieHeader(new URL("https://chat.line.biz/"))).toBe("");
  });

  it("propagates cookie store failures", async () => {
    const m = mockFetch(json({}));
    const boom = new Error("store down");
    await expect(
      make({
        fetch: m.fetch,
        cookieStore: {
          getCookieHeader: () => {
            throw boom;
          },
        },
      }).request(GET_CHAT),
    ).rejects.toBe(boom);
  });

  // Review Focus 3
  it("HTML 200 -> UnexpectedResponseError", async () => {
    const m = mockFetch(new Response("<html>maintenance</html>", { status: 200 }));
    await expect(make({ fetch: m.fetch }).request(GET_CHAT)).rejects.toMatchObject({
      code: "UNEXPECTED_RESPONSE",
      status: 200,
      body: "<html>maintenance</html>",
    });
  });

  it("empty 200 -> undefined", async () => {
    const m = mockFetch(new Response("", { status: 200 }));
    await expect(make({ fetch: m.fetch }).request(GET_CHAT)).resolves.toBeUndefined();
  });

  it("absoluteURL must be LINE host", async () => {
    const m = mockFetch();
    await expect(
      make({ fetch: m.fetch }).request({
        service: "account",
        method: "GET",
        path: "",
        absoluteURL: "https://evil.example/",
      }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(m.calls).toHaveLength(0);
  });

  it("onError fires once for pre-flight errors, without calling fetch", async () => {
    const m = mockFetch();
    const seen: {
      url: string;
      headers: Record<string, string>;
      attempt: number;
      error: unknown;
    }[] = [];
    await expect(
      make({
        fetch: m.fetch,
        hooks: {
          onError: (c) => {
            seen.push(c);
          },
        },
      }).request({
        service: "account",
        method: "GET",
        path: "",
        absoluteURL: "https://evil.example/",
      }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.error).toBeInstanceOf(UnexpectedResponseError);
    expect(seen[0]).toMatchObject({ url: "https://evil.example/", headers: {}, attempt: 0 });
    expect(m.calls).toHaveLength(0);
  });

  it("onError is not called for an error thrown by onRequest", async () => {
    const errs: unknown[] = [];
    const boom = new UnexpectedResponseError("from hook");
    await expect(
      make({
        hooks: {
          onRequest: () => {
            throw boom;
          },
          onError: (c) => {
            errs.push(c.error);
          },
        },
      }).request(GET_CHAT),
    ).rejects.toBe(boom);
    expect(errs).toHaveLength(0);
  });

  it("absoluteURL on a LINE host is used as is", async () => {
    const m = mockFetch(json({}));
    await make({ fetch: m.fetch }).request({
      service: "account",
      method: "GET",
      path: "",
      absoluteURL: "https://access.line.me/oauth2/v2.1/x",
    });
    expect(m.calls[0]!.url).toBe("https://access.line.me/oauth2/v2.1/x");
  });

  it("hooks see redacted cookie; onRequest throw aborts; onResponse throw ignored", async () => {
    const seen: string[] = [];
    const m = mockFetch(json({}));
    await make({
      fetch: m.fetch,
      hooks: {
        onRequest: (c) => {
          seen.push(c.headers.Cookie ?? c.headers.cookie ?? "");
        },
        onResponse: () => {
          throw new Error("ignored");
        },
      },
    }).request(GET_CHAT);
    expect(seen).toEqual(["[REDACTED]"]);
    const boom = new Error("stop");
    await expect(
      make({
        fetch: mockFetch().fetch,
        hooks: {
          onRequest: () => {
            throw boom;
          },
        },
      }).request(GET_CHAT),
    ).rejects.toBe(boom);
  });

  it("onResponse fires for error statuses with status and duration", async () => {
    const got: { status: number; durationMs: number; attempt: number }[] = [];
    const m = mockFetch(json({}, { status: 404 }));
    await make({
      fetch: m.fetch,
      hooks: {
        onResponse: (c) => {
          got.push({ status: c.status, durationMs: c.durationMs, attempt: c.attempt });
        },
      },
    })
      .request(GET_CHAT)
      .catch(() => undefined);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ status: 404, attempt: 0 });
    expect(got[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("onError receives final error", async () => {
    const errs: unknown[] = [];
    const m = mockFetch(json({}, { status: 404 }));
    await expect(
      make({
        fetch: m.fetch,
        hooks: {
          onError: (c) => {
            errs.push(c.error);
          },
        },
      }).request(GET_CHAT),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(errs).toHaveLength(1);
  });

  it("onError throw is swallowed", async () => {
    const m = mockFetch(json({}, { status: 404 }));
    await expect(
      make({
        fetch: m.fetch,
        hooks: {
          onError: () => {
            throw new Error("ignored");
          },
        },
      }).request(GET_CHAT),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
