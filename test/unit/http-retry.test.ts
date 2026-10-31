import { describe, expect, it } from "vitest";
import {
  AbortError,
  ConnectionError,
  InternalServerError,
  NotFoundError,
  TimeoutError,
  UnexpectedResponseError,
} from "../../src/core/errors.js";
import { make } from "../helpers/make-http.js";
import { json, mockFetch } from "../helpers/mock-fetch.js";

const GET = { service: "chat", method: "GET", path: "/" } as const;

function recordingSleep(): { delays: number[]; sleep: (ms: number) => Promise<void> } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

const hang = (req: Request): Promise<Response> =>
  new Promise<Response>((_, reject) => {
    req.signal.addEventListener("abort", () => {
      reject(req.signal.reason as Error);
    });
  });

describe("retry", () => {
  it("retries 503 then succeeds", async () => {
    const { sleep } = recordingSleep();
    const m = mockFetch(json({}, { status: 503 }), json({ ok: true }));
    await expect(make({ fetch: m.fetch, maxRetries: 2, sleep }).request(GET)).resolves.toEqual({
      ok: true,
    });
    expect(m.calls).toHaveLength(2);
  });

  it("honours Retry-After on 429", async () => {
    const { delays, sleep } = recordingSleep();
    const m = mockFetch(json({}, { status: 429, headers: { "retry-after": "3" } }), json({}));
    await make({ fetch: m.fetch, maxRetries: 1, sleep }).request(GET);
    expect(delays).toEqual([3000]);
  });

  it("uses exponential backoff without Retry-After", async () => {
    const { delays, sleep } = recordingSleep();
    const m = mockFetch(json({}, { status: 500 }), json({}, { status: 500 }), json({}));
    await make({ fetch: m.fetch, maxRetries: 2, sleep }).request(GET);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(375);
    expect(delays[0]).toBeLessThanOrEqual(625);
    expect(delays[1]).toBeGreaterThanOrEqual(750);
    expect(delays[1]).toBeLessThanOrEqual(1250);
  });

  it("gives up after maxRetries", async () => {
    const { sleep } = recordingSleep();
    const m = mockFetch(
      json({}, { status: 500 }),
      json({}, { status: 500 }),
      json({}, { status: 500 }),
    );
    await expect(
      make({ fetch: m.fetch, maxRetries: 2, sleep }).request(GET),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(m.calls).toHaveLength(3);
  });

  it("never retries POST", async () => {
    const { sleep } = recordingSleep();
    const m = mockFetch(json({}, { status: 503 }));
    await expect(
      make({ fetch: m.fetch, maxRetries: 2, sleep }).request({ ...GET, method: "POST" }),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(m.calls).toHaveLength(1);
  });

  it("never retries 404", async () => {
    const { sleep } = recordingSleep();
    const m = mockFetch(json({}, { status: 404 }));
    await expect(
      make({ fetch: m.fetch, maxRetries: 2, sleep }).request(GET),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(m.calls).toHaveLength(1);
  });

  it("never retries an unexpected (non-JSON) response", async () => {
    const { sleep } = recordingSleep();
    const m = mockFetch(new Response("<html>", { status: 200 }));
    await expect(
      make({ fetch: m.fetch, maxRetries: 2, sleep }).request(GET),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(m.calls).toHaveLength(1);
  });

  it("retries network errors", async () => {
    const { sleep } = recordingSleep();
    const m = mockFetch(
      () => {
        throw new TypeError("fetch failed");
      },
      json({ ok: true }),
    );
    await expect(make({ fetch: m.fetch, maxRetries: 1, sleep }).request(GET)).resolves.toEqual({
      ok: true,
    });
    expect(m.calls).toHaveLength(2);
  });

  it("counts attempts in hooks", async () => {
    const { sleep } = recordingSleep();
    const attempts: number[] = [];
    const m = mockFetch(json({}, { status: 502 }), json({}));
    await make({
      fetch: m.fetch,
      maxRetries: 1,
      sleep,
      hooks: {
        onRequest: (c) => {
          attempts.push(c.attempt);
        },
      },
    }).request(GET);
    expect(attempts).toEqual([0, 1]);
  });

  it("fires onError once with the final error", async () => {
    const { sleep } = recordingSleep();
    const errors: unknown[] = [];
    const m = mockFetch(json({}, { status: 500 }), json({}, { status: 503 }));
    await expect(
      make({
        fetch: m.fetch,
        maxRetries: 1,
        sleep,
        hooks: {
          onError: (c) => {
            errors.push(c.error);
          },
        },
      }).request(GET),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ status: 503 });
  });

  it("does not retry or report an error thrown by onRequest", async () => {
    const { sleep } = recordingSleep();
    const boom = new ConnectionError("from hook");
    let onErrorCalls = 0;
    let onRequestCalls = 0;
    const m = mockFetch(json({}));
    await expect(
      make({
        fetch: m.fetch,
        maxRetries: 2,
        sleep,
        hooks: {
          onRequest: () => {
            onRequestCalls++;
            throw boom;
          },
          onError: () => {
            onErrorCalls++;
          },
        },
      }).request(GET),
    ).rejects.toBe(boom);
    expect(onRequestCalls).toBe(1);
    expect(onErrorCalls).toBe(0);
    expect(m.calls).toHaveLength(0);
  });
});

describe("timeout", () => {
  it("rejects with TimeoutError", async () => {
    const m = mockFetch(hang);
    await expect(make({ fetch: m.fetch }).request(GET, { timeout: 20 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it("uses the configured timeout and names the request", async () => {
    const m = mockFetch(hang);
    await expect(make({ fetch: m.fetch, timeout: 20 }).request(GET)).rejects.toThrow(
      /timed out after 20ms: GET https:\/\/chat\.line\.biz\//,
    );
  });

  it("retries a timed-out GET", async () => {
    const { sleep } = recordingSleep();
    const m = mockFetch(hang, json({ ok: true }));
    await expect(
      make({ fetch: m.fetch, maxRetries: 1, sleep }).request(GET, { timeout: 20 }),
    ).resolves.toEqual({ ok: true });
    expect(m.calls).toHaveLength(2);
  });

  it("covers reading the body", async () => {
    const stall = (req: Request): Response => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          req.signal.addEventListener("abort", () => {
            controller.error(req.signal.reason);
          });
        },
      });
      return new Response(body, { status: 200 });
    };
    const m = mockFetch(stall);
    await expect(make({ fetch: m.fetch }).request(GET, { timeout: 20 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });
});

describe("abort", () => {
  it("rejects with AbortError without calling fetch when already aborted", async () => {
    const { sleep } = recordingSleep();
    const ac = new AbortController();
    ac.abort();
    const m = mockFetch(json({}));
    await expect(
      make({ fetch: m.fetch, maxRetries: 2, sleep }).request(GET, { signal: ac.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(m.calls).toHaveLength(0);
  });

  it("rejects with AbortError when aborted mid-flight, without retrying", async () => {
    const { sleep } = recordingSleep();
    const ac = new AbortController();
    const m = mockFetch(hang);
    const p = make({ fetch: m.fetch, maxRetries: 2, sleep }).request(GET, { signal: ac.signal });
    setTimeout(() => {
      ac.abort();
    }, 10);
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(m.calls).toHaveLength(1);
  });

  it("abort during backoff stops immediately", async () => {
    const ac = new AbortController();
    const m = mockFetch(json({}, { status: 503 }), json({}));
    const p = make({ fetch: m.fetch, maxRetries: 2 }).request(GET, { signal: ac.signal });
    setTimeout(() => {
      ac.abort();
    }, 10);
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(m.calls).toHaveLength(1);
  });

  it("reports AbortError to onError once", async () => {
    const ac = new AbortController();
    ac.abort();
    const errors: unknown[] = [];
    await expect(
      make({
        fetch: mockFetch(json({})).fetch,
        hooks: {
          onError: (c) => {
            errors.push(c.error);
          },
        },
      }).request(GET, { signal: ac.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(errors).toHaveLength(1);
  });
});
