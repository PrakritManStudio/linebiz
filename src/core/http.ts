import type { CookieStore } from "./cookies.js";
import {
  APIError,
  AbortError,
  ConfigError,
  ConnectionError,
  TimeoutError,
  UnexpectedResponseError,
  ValidationError,
  isLineBizError,
  redactHeaders,
  truncateBody,
} from "./errors.js";
import type { LineBizError } from "./errors.js";
import { backoffDelay, isRetryableStatus, parseRetryAfter } from "./retry.js";
import { isAllowedAbsoluteURL } from "./services.js";
import type { Service } from "./services.js";

/** Largest timeout (ms) `AbortSignal.timeout` honours; Node fires larger values after 1 ms (2^31 - 1). */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/** Value accepted in a query string; `undefined` entries are skipped, arrays are comma-joined. */
export type QueryValue = string | number | boolean | readonly string[] | undefined;

/** Description of a single API call. */
export interface RequestDescriptor {
  /** Service whose base URL is used. */
  service: Service;
  /** HTTP method. */
  method: "GET" | "POST";
  /** Path (starting with `/`) appended to the service base URL. */
  path: string;
  /** Query-string parameters. */
  query?: Record<string, QueryValue>;
  /** JSON-serialisable request body. */
  body?: unknown;
  /** Full URL that replaces `service` + `path`; must be a LINE host. */
  absoluteURL?: string;
  /** Resolve `undefined` on a 3xx response instead of failing. */
  allowRedirect?: boolean;
}

/** Per-call options. */
export interface RequestOptions {
  /** Abort signal for the call. */
  signal?: AbortSignal;
  /** Timeout override in milliseconds. */
  timeout?: number;
  /**
   * Extra headers; take precedence over client-level headers. For chat write requests an
   * `X-XSRF-TOKEN` header makes the SDK skip its automatic CSRF token fetch; only that exact
   * name (any case) is recognised for the shortcut.
   */
  headers?: Record<string, string>;
}

/** Information passed to the `onRequest` hook (cookies redacted). */
export interface RequestContext {
  /** HTTP method. */
  method: string;
  /** Full request URL. */
  url: string;
  /** Outgoing headers with `cookie` and CSRF token values redacted. */
  headers: Record<string, string>;
  /** Zero-based attempt number. */
  attempt: number;
}

/** Information passed to the `onResponse` hook. */
export interface ResponseContext extends RequestContext {
  /** HTTP status code. */
  status: number;
  /** Response headers (lowercase keys, `set-cookie` redacted). */
  responseHeaders: Record<string, string>;
  /** Time between sending the request and receiving the headers, in milliseconds. */
  durationMs: number;
}

/** Information passed to the `onError` hook. */
export interface ErrorContext extends RequestContext {
  /** The final error the call is about to reject with. */
  error: LineBizError;
}

/**
 * Observability hooks. Errors thrown by `onResponse` / `onError` are ignored.
 *
 * Hooks observe the HTTP pipeline only: request building, network, HTTP status and response
 * parsing. Errors raised by a resource method before or after the pipeline (argument validation,
 * unexpected list shapes, a cursor that does not advance, a missing `logoutUri`) are not reported.
 */
export interface Hooks {
  /** Called before each request is sent; throwing aborts the call. */
  onRequest?(ctx: RequestContext): void | Promise<void>;
  /** Called after a response is received, for every status. */
  onResponse?(ctx: ResponseContext): void | Promise<void>;
  /** Called once with the final error raised inside the HTTP pipeline (request building, network, HTTP status, response parsing). */
  onError?(ctx: ErrorContext): void | Promise<void>;
}

/** Resolved configuration of an {@link HttpClient}. */
export interface HttpConfig {
  /** Base URL of each service. */
  baseURLs: Record<Service, string>;
  /** `fetch` implementation. */
  fetch: typeof globalThis.fetch;
  /** Headers added to every request. */
  headers: Record<string, string>;
  /** Default `User-Agent`. */
  userAgent: string;
  /** Value of `x-oa-chat-client-version` for the chat service. */
  clientVersion: string;
  /** Default timeout in milliseconds. */
  timeout: number;
  /** Maximum number of retries. */
  maxRetries: number;
  /** Cookie storage. */
  cookieStore: CookieStore;
  /** Observability hooks. */
  hooks: Hooks;
  /** Sleep implementation used between retries (injectable for tests). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Build a request URL from a base URL, a path and query parameters.
 *
 * @param baseURL Service base URL.
 * @param path Path appended to the base URL.
 * @param query Query parameters; `undefined` is skipped and arrays are joined with `,`.
 * @returns The resulting URL.
 */
export function buildURL(baseURL: string, path: string, query?: Record<string, QueryValue>): URL {
  // Concatenate instead of resolving so that a path such as "//host" cannot change the host.
  const url = new URL(baseURL.replace(/\/+$/, "") + path);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.append(key, typeof value === "object" ? value.join(",") : String(value));
    }
  }
  return url;
}

function resolveURL(config: HttpConfig, desc: RequestDescriptor): URL {
  if (desc.absoluteURL === undefined) {
    return buildURL(config.baseURLs[desc.service], desc.path, desc.query);
  }
  let url: URL | undefined;
  try {
    url = new URL(desc.absoluteURL);
  } catch {
    url = undefined;
  }
  if (url === undefined || !isAllowedAbsoluteURL(url)) {
    throw new UnexpectedResponseError("Refusing to call non-LINE URL");
  }
  return url;
}

/** Why a user-supplied header was refused. */
export interface HeaderProblem {
  /** Name of the offending header (never its value). */
  name: string;
  /** `cookie` for a `Cookie` header, `invalid` when the runtime refuses the name or value. */
  reason: "cookie" | "invalid";
}

/**
 * Find the first user-supplied header that cannot be sent: a `Cookie` header (cookies must go
 * through the cookie store) or a name / value the runtime refuses.
 *
 * @param headers Header map to check.
 * @returns The first problem found, or `undefined` when every header is acceptable.
 * @internal
 */
export function findHeaderProblem(headers: Record<string, string>): HeaderProblem | undefined {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "cookie") return { name, reason: "cookie" };
    try {
      // Use a throwaway Headers: the runtime's TypeError would quote the header value.
      new Headers([[name, value]]);
    } catch {
      return { name, reason: "invalid" };
    }
  }
  return undefined;
}

/**
 * Describe a {@link HeaderProblem} without quoting the header value.
 *
 * @param problem The problem to describe.
 * @returns A message that names the header only.
 * @internal
 */
export function describeHeaderProblem({ name, reason }: HeaderProblem): string {
  return reason === "cookie"
    ? 'The "cookie" header is not allowed in headers; pass cookies through "cookies" or "cookieStore"'
    : `Header "${name}" has an invalid name or value`;
}

function buildHeaders(
  config: HttpConfig,
  desc: RequestDescriptor,
  options: RequestOptions,
): Headers {
  const configProblem = findHeaderProblem(config.headers);
  if (configProblem !== undefined) {
    throw new ConfigError(describeHeaderProblem(configProblem), { code: "INVALID_OPTIONS" });
  }
  const callHeaders = options.headers ?? {};
  const callProblem = findHeaderProblem(callHeaders);
  if (callProblem !== undefined) {
    throw new ValidationError({
      param: "headers",
      value: callProblem.name,
      reason: describeHeaderProblem(callProblem),
    });
  }
  const headers = new Headers({ "User-Agent": config.userAgent, Accept: "application/json" });
  if (desc.service === "chat") headers.set("x-oa-chat-client-version", config.clientVersion);
  if (desc.body !== undefined) headers.set("Content-Type", "application/json");
  for (const [name, value] of Object.entries(config.headers)) headers.set(name, value);
  for (const [name, value] of Object.entries(callHeaders)) headers.set(name, value);
  return headers;
}

async function safeHook(call: (() => void | Promise<void>) | undefined): Promise<void> {
  if (call === undefined) return;
  try {
    await call();
  } catch {
    // Observability hooks must never affect the outcome of a request.
  }
}

/**
 * Default {@link HttpConfig.sleep}: a timer that rejects with {@link AbortError} when `signal` aborts.
 *
 * @param ms Delay in milliseconds.
 * @param signal Optional abort signal.
 * @returns A promise that resolves after `ms`.
 * @internal
 */
export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new AbortError("Request aborted", { cause: signal.reason }));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortError("Request aborted", { cause: signal?.reason }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Whether a failed GET attempt may be retried. */
function isRetryable(error: unknown): boolean {
  if (error instanceof ConnectionError) return true;
  return error instanceof APIError && isRetryableStatus(error.status);
}

/** Header the chat service expects the CSRF token in, unless `/api/v1/csrfToken` names another. */
const DEFAULT_CSRF_HEADER = "x-xsrf-token";
const CSRF_TOKEN_PATH = "/api/v1/csrfToken";

/** CSRF header name and token as returned by `GET /api/v1/csrfToken`. */
interface CsrfToken {
  headerName: string;
  token: string;
}

/** Everything about a call that stays constant across attempts (the CSRF header aside). */
interface PreparedRequest {
  desc: RequestDescriptor;
  options: RequestOptions;
  url: URL;
  headers: Headers;
  /** Name of the CSRF header currently set on `headers`; its value is redacted in hook contexts. */
  csrfHeader?: string;
}

/** Validate the `/api/v1/csrfToken` body without ever quoting it. */
function parseCsrfToken(raw: unknown): CsrfToken {
  const invalid = (): UnexpectedResponseError =>
    new UnexpectedResponseError("Invalid CSRF token response");
  if (typeof raw !== "object" || raw === null) throw invalid();
  const { headerName, token } = raw as { headerName?: unknown; token?: unknown };
  if (typeof headerName !== "string" || typeof token !== "string") throw invalid();
  if (headerName === "" || token === "") throw invalid();
  try {
    new Headers([[headerName, token]]);
  } catch {
    throw invalid();
  }
  return { headerName, token };
}

function abortError(desc: RequestDescriptor, url: URL, cause?: unknown): AbortError {
  return new AbortError(`Request aborted: ${desc.method} ${url.toString()}`, { cause });
}

/**
 * Wait for `promise`, but reject as soon as `signal` aborts. The promise itself is not cancelled,
 * so other waiters on it are unaffected.
 */
async function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => AbortError,
): Promise<T> {
  if (signal === undefined) return promise;
  let cleanup = (): void => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const fail = (): void => {
      reject(onAbort());
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
    cleanup = () => {
      signal.removeEventListener("abort", fail);
    };
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    cleanup();
  }
}

/** Mutable slot a single attempt fills so the caller can report the final error. */
interface AttemptState {
  ctx: RequestContext;
  /** Error thrown by the caller's own `onRequest` hook; it must not trigger `onError`. */
  hookError?: { error: unknown };
}

/** HTTP pipeline shared by every resource: URL, headers, cookies, hooks and error mapping. */
export class HttpClient {
  /** Resolved configuration. */
  readonly config: HttpConfig;

  /** CSRF token shared by all writes of this client; cleared when its fetch fails or it is rejected. */
  #csrf: Promise<CsrfToken> | undefined;

  /** Errors thrown by a caller's `onRequest` hook inside a nested call; they never reach `onError`. */
  readonly #settled = new WeakSet<object>();

  /** @param config Resolved client configuration. */
  constructor(config: HttpConfig) {
    this.config = config;
  }

  /**
   * Perform an API call and return the parsed JSON body.
   *
   * @param desc What to call.
   * @param options Per-call options.
   * @returns The parsed JSON body, or `undefined` for an empty body (or an allowed redirect).
   * @throws {LineBizError} On any failure.
   */
  request<T>(desc: RequestDescriptor, options: RequestOptions = {}): Promise<T> {
    return this.#send<T>(desc, options, true);
  }

  /**
   * Forget the cached CSRF token so the next chat write fetches a new one (e.g. after sign-out).
   *
   * @internal
   */
  clearCsrfToken(): void {
    this.#csrf = undefined;
  }

  /** {@link HttpClient.request}; `report: false` keeps an internal call from firing `onError`. */
  async #send<T>(desc: RequestDescriptor, options: RequestOptions, report: boolean): Promise<T> {
    // Context reported to `onError` if the call fails before the request is fully built.
    const state: AttemptState = {
      ctx: {
        method: desc.method,
        url: desc.absoluteURL ?? this.config.baseURLs[desc.service] + desc.path,
        headers: {},
        attempt: 0,
      },
    };
    try {
      if (
        options.timeout !== undefined &&
        (!Number.isInteger(options.timeout) ||
          options.timeout < 1 ||
          options.timeout > MAX_TIMEOUT_MS)
      ) {
        throw new ValidationError({
          param: "timeout",
          value: options.timeout,
          reason: `must be an integer between 1 and ${String(MAX_TIMEOUT_MS)}`,
        });
      }
      const headers = buildHeaders(this.config, desc, options);
      const prepared: PreparedRequest = {
        desc,
        options,
        url: resolveURL(this.config, desc),
        headers,
      };
      // Chat writes need the session's CSRF token unless the caller supplied one themselves.
      const callerHeaders = new Set(
        [...Object.keys(this.config.headers), ...Object.keys(options.headers ?? {})].map((name) =>
          name.toLowerCase(),
        ),
      );
      let csrfManaged =
        desc.method !== "GET" &&
        desc.service === "chat" &&
        desc.absoluteURL === undefined &&
        !callerHeaders.has(DEFAULT_CSRF_HEADER);
      let csrfResent = false;
      let csrfUsed: Promise<CsrfToken> | undefined;
      const applyCsrf = async (): Promise<void> => {
        csrfUsed = this.#csrf ?? this.#fetchCsrf();
        const { headerName, token } = await raceAbort(csrfUsed, options.signal, () =>
          abortError(desc, prepared.url, options.signal?.reason),
        );
        if (callerHeaders.has(headerName.toLowerCase())) {
          csrfManaged = false;
          return;
        }
        if (prepared.csrfHeader !== undefined) headers.delete(prepared.csrfHeader);
        headers.set(headerName, token);
        prepared.csrfHeader = headerName;
      };
      if (csrfManaged) await applyCsrf();
      state.ctx = {
        ...state.ctx,
        url: prepared.url.toString(),
        headers: redactHeaders(
          Object.fromEntries(headers),
          prepared.csrfHeader === undefined ? [] : [prepared.csrfHeader],
        ),
      };
      const sleep = this.config.sleep ?? defaultSleep;
      for (let n = 0; ; n++) {
        try {
          return await this.attempt<T>(prepared, n, state);
        } catch (error) {
          if (
            csrfManaged &&
            !csrfResent &&
            error instanceof APIError &&
            error.status === 403 &&
            state.hookError?.error !== error
          ) {
            // The server rejected the write before running it, so one resend with a fresh token is safe.
            csrfResent = true;
            if (this.#csrf === csrfUsed) this.#csrf = undefined;
            await applyCsrf();
            continue;
          }
          const retry =
            desc.method === "GET" &&
            n < this.config.maxRetries &&
            state.hookError?.error !== error &&
            isRetryable(error);
          if (!retry) throw error;
          // Retry-After applies to any retryable response (429, 503, ...), not only 429.
          const retryAfter =
            error instanceof APIError
              ? parseRetryAfter(error.headers["retry-after"] ?? null)
              : undefined;
          await sleep(retryAfter ?? backoffDelay(n), options.signal);
        }
      }
    } catch (error) {
      // A hook error thrown inside the nested CSRF fetch reaches the writers as a plain error.
      const hookError = state.hookError?.error === error;
      if (hookError && typeof error === "object" && error !== null) this.#settled.add(error);
      const settled = typeof error === "object" && error !== null && this.#settled.has(error);
      if (report && isLineBizError(error) && !hookError && !settled) {
        const ctx = state.ctx;
        await safeHook(() => this.config.hooks.onError?.({ ...ctx, error }));
      }
      throw error;
    }
  }

  /**
   * Start (and cache) a CSRF token fetch through the regular pipeline. The fetch is shared by every
   * waiting writer, so it uses neither a caller's signal nor a caller's timeout, and its failures are
   * reported by each writer's own `onError` rather than by the fetch itself.
   */
  #fetchCsrf(): Promise<CsrfToken> {
    const promise = this.#send<unknown>(
      { service: "chat", method: "GET", path: CSRF_TOKEN_PATH },
      {},
      false,
    ).then(parseCsrfToken);
    this.#csrf = promise;
    promise.catch(() => {
      if (this.#csrf === promise) this.#csrf = undefined;
    });
    return promise;
  }

  /** Perform exactly one attempt; {@link HttpClient.request} wraps it in the retry loop. */
  private async attempt<T>(
    { desc, options, url, headers: baseHeaders, csrfHeader }: PreparedRequest,
    attempt: number,
    state: AttemptState,
  ): Promise<T> {
    const { config } = this;
    const method = desc.method;
    const urlString = url.toString();

    delete state.hookError;
    const abortedError = (): AbortError =>
      new AbortError(`Request aborted: ${method} ${urlString}`, { cause: options.signal?.reason });
    if (options.signal?.aborted === true) throw abortedError();

    const timeoutMs = options.timeout ?? config.timeout;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      options.signal === undefined
        ? timeoutSignal
        : AbortSignal.any([options.signal, timeoutSignal]);
    // A failed fetch / body read is an abort, a timeout or a plain connection failure.
    const classify = (cause: unknown): LineBizError => {
      if (options.signal?.aborted === true) return abortedError();
      if (timeoutSignal.aborted) {
        return new TimeoutError(
          `Request timed out after ${String(timeoutMs)}ms: ${method} ${urlString}`,
          {
            cause,
          },
        );
      }
      return new ConnectionError(`Request failed: ${method} ${urlString}`, { cause });
    };

    const headers = new Headers(baseHeaders);
    const cookie = await config.cookieStore.getCookieHeader(url);
    if (cookie !== "") {
      try {
        headers.set("Cookie", cookie);
      } catch {
        // The runtime's TypeError quotes the whole header value, so it is deliberately dropped.
        throw new ConfigError("Cookie store returned an invalid Cookie header", {
          code: "INVALID_COOKIE",
        });
      }
    }

    const ctx: RequestContext = {
      method,
      url: urlString,
      headers: redactHeaders(
        Object.fromEntries(headers),
        csrfHeader === undefined ? [] : [csrfHeader],
      ),
      attempt,
    };
    state.ctx = ctx;
    try {
      await config.hooks.onRequest?.(ctx);
    } catch (error) {
      state.hookError = { error };
      throw error;
    }

    const init: RequestInit = { method, headers, redirect: "manual", signal };
    if (desc.body !== undefined) init.body = JSON.stringify(desc.body);

    const started = performance.now();
    let response: Response;
    try {
      response = await config.fetch(urlString, init);
    } catch (cause) {
      throw classify(cause);
    }
    const durationMs = performance.now() - started;
    const { status } = response;

    // Persist cookies before looking at the status: error responses may rotate the session.
    const setCookies =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    if (setCookies.length > 0) await config.cookieStore.setCookies?.(url, setCookies);

    const responseHeaders = Object.fromEntries(response.headers);
    await safeHook(() =>
      config.hooks.onResponse?.({
        ...ctx,
        status,
        responseHeaders: redactHeaders(responseHeaders),
        durationMs,
      }),
    );

    if (status >= 300 && status < 400) {
      await response.body?.cancel().catch(() => undefined);
      if (desc.allowRedirect === true) return undefined as T;
      const location = response.headers.get("location");
      throw new UnexpectedResponseError(`Unexpected redirect from ${method} ${urlString}`, {
        status,
        ...(location !== null && { location }),
      });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (cause) {
      throw classify(cause);
    }

    if (status < 200 || status >= 300) {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = truncateBody(text);
      }
      throw APIError.from({ status, body, headers: responseHeaders, method, url: urlString });
    }

    if (text === "") return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new UnexpectedResponseError(`Response from ${method} ${urlString} is not valid JSON`, {
        status,
        body: truncateBody(text),
        cause,
      });
    }
  }
}
