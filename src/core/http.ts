import type { CookieStore } from "./cookies.js";
import {
  APIError,
  ConnectionError,
  UnexpectedResponseError,
  isLineBizError,
  redactHeaders,
  truncateBody,
} from "./errors.js";
import type { LineBizError } from "./errors.js";
import { isAllowedAbsoluteURL } from "./services.js";
import type { Service } from "./services.js";

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
  /** Extra headers; take precedence over client-level headers. */
  headers?: Record<string, string>;
}

/** Information passed to the `onRequest` hook (cookies redacted). */
export interface RequestContext {
  /** HTTP method. */
  method: string;
  /** Full request URL. */
  url: string;
  /** Outgoing headers with `cookie` redacted. */
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

/** Observability hooks. Errors thrown by `onResponse` / `onError` are ignored. */
export interface Hooks {
  /** Called before each request is sent; throwing aborts the call. */
  onRequest?(ctx: RequestContext): void | Promise<void>;
  /** Called after a response is received, for every status. */
  onResponse?(ctx: ResponseContext): void | Promise<void>;
  /** Called once with the final error when a call fails. */
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

function buildHeaders(
  config: HttpConfig,
  desc: RequestDescriptor,
  options: RequestOptions,
): Headers {
  const headers = new Headers({ "User-Agent": config.userAgent, Accept: "application/json" });
  if (desc.service === "chat") headers.set("x-oa-chat-client-version", config.clientVersion);
  if (desc.body !== undefined) headers.set("Content-Type", "application/json");
  for (const [name, value] of Object.entries(config.headers)) headers.set(name, value);
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
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

/** Everything about a call that stays constant across attempts. */
interface PreparedRequest {
  desc: RequestDescriptor;
  options: RequestOptions;
  url: URL;
  headers: Headers;
}

/** Mutable slot a single attempt fills so the caller can report the final error. */
interface AttemptState {
  ctx?: RequestContext;
}

/** HTTP pipeline shared by every resource: URL, headers, cookies, hooks and error mapping. */
export class HttpClient {
  /** Resolved configuration. */
  readonly config: HttpConfig;

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
  async request<T>(desc: RequestDescriptor, options: RequestOptions = {}): Promise<T> {
    const prepared: PreparedRequest = {
      desc,
      options,
      url: resolveURL(this.config, desc),
      headers: buildHeaders(this.config, desc, options),
    };
    const state: AttemptState = {};
    try {
      return await this.attempt<T>(prepared, 0, state);
    } catch (error) {
      const ctx = state.ctx;
      if (ctx !== undefined && isLineBizError(error)) {
        await safeHook(() => this.config.hooks.onError?.({ ...ctx, error }));
      }
      throw error;
    }
  }

  /** Perform exactly one attempt. A retry loop can wrap this method. */
  private async attempt<T>(
    { desc, options, url, headers: baseHeaders }: PreparedRequest,
    attempt: number,
    state: AttemptState,
  ): Promise<T> {
    const { config } = this;
    const method = desc.method;
    const urlString = url.toString();

    const headers = new Headers(baseHeaders);
    const cookie = await config.cookieStore.getCookieHeader(url);
    if (cookie !== "") headers.set("Cookie", cookie);

    const ctx: RequestContext = {
      method,
      url: urlString,
      headers: redactHeaders(Object.fromEntries(headers)),
      attempt,
    };
    await config.hooks.onRequest?.(ctx);
    state.ctx = ctx;

    const init: RequestInit = { method, headers, redirect: "manual" };
    if (desc.body !== undefined) init.body = JSON.stringify(desc.body);
    if (options.signal !== undefined) init.signal = options.signal;

    const started = performance.now();
    let response: Response;
    try {
      response = await config.fetch(urlString, init);
    } catch (cause) {
      throw new ConnectionError(`Request failed: ${method} ${urlString}`, { cause });
    }
    const durationMs = performance.now() - started;
    const { status } = response;

    // Persist cookies before looking at the status: error responses may rotate the session.
    const setCookies = response.headers.getSetCookie();
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
      throw new ConnectionError(`Request failed: ${method} ${urlString}`, { cause });
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
