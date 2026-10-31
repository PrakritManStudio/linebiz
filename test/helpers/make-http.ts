import { MemoryCookieStore } from "../../src/core/cookies.js";
import { HttpClient } from "../../src/core/http.js";
import type { HttpConfig } from "../../src/core/http.js";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_CLIENT_VERSION,
  DEFAULT_USER_AGENT,
} from "../../src/core/services.js";

/** Create an `HttpClient` with test defaults (no retries, throwing fetch, `ses=S` cookie). */
export function make(overrides: Partial<HttpConfig> = {}): HttpClient {
  return new HttpClient({
    baseURLs: { ...DEFAULT_BASE_URLS },
    fetch: () => {
      throw new Error("fetch should not be called");
    },
    headers: {},
    userAgent: DEFAULT_USER_AGENT,
    clientVersion: DEFAULT_CLIENT_VERSION,
    timeout: 30_000,
    maxRetries: 0,
    cookieStore: new MemoryCookieStore("ses=S"),
    hooks: {},
    ...overrides,
  });
}
