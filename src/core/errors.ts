import { parseRetryAfter } from "./retry.js";

/** Machine-readable error codes carried by every {@link LineBizError}. */
export const LineBizErrorCode = {
  INVALID_OPTIONS: "INVALID_OPTIONS",
  INVALID_COOKIE: "INVALID_COOKIE",
  INVALID_PARAMETER: "INVALID_PARAMETER",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  TIMEOUT: "TIMEOUT",
  ABORTED: "ABORTED",
  UNEXPECTED_RESPONSE: "UNEXPECTED_RESPONSE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  UNAUTHORIZED: "UNAUTHORIZED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  SERVER_ERROR: "SERVER_ERROR",
  API_ERROR: "API_ERROR",
} as const;

/** Union of all {@link LineBizErrorCode} values. */
export type LineBizErrorCode = (typeof LineBizErrorCode)[keyof typeof LineBizErrorCode];

const BRAND: symbol = Symbol.for("linebiz.error");
const MAX_BODY_LENGTH = 2000;
const REDACTED = "[REDACTED]";

/** Base class of every error thrown by this SDK. */
export class LineBizError extends Error {
  /** Machine-readable error code. */
  readonly code: LineBizErrorCode;

  /**
   * @param code Machine-readable error code.
   * @param message Human-readable message (never contains cookie values).
   * @param options Optional underlying `cause`.
   */
  constructor(code: LineBizErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LineBizError";
    this.code = code;
  }
}

Object.defineProperty(LineBizError.prototype, BRAND, { value: true });

/** Thrown when client options or cookies are invalid. */
export class ConfigError extends LineBizError {
  /**
   * @param message Human-readable message.
   * @param options Optional specific `code` (default `INVALID_OPTIONS`) and `cause`.
   */
  constructor(
    message: string,
    options?: { code?: "INVALID_OPTIONS" | "INVALID_COOKIE"; cause?: unknown },
  ) {
    super(options?.code ?? LineBizErrorCode.INVALID_OPTIONS, message, { cause: options?.cause });
    this.name = "ConfigError";
  }
}

/** Thrown when a method argument fails validation. */
export class ValidationError extends LineBizError {
  /** Name of the offending parameter. */
  readonly param: string;
  /** The rejected value. */
  readonly value: unknown;
  /** Why the value was rejected. */
  readonly reason: string;

  /** @param init Offending parameter name, value and reason. */
  constructor(init: { param: string; value: unknown; reason: string }) {
    super(LineBizErrorCode.INVALID_PARAMETER, `Invalid parameter "${init.param}": ${init.reason}`);
    this.name = "ValidationError";
    this.param = init.param;
    this.value = init.value;
    this.reason = init.reason;
  }
}

/** Thrown when the network request could not be completed. */
export class ConnectionError extends LineBizError {
  /**
   * @param message Human-readable message.
   * @param options Optional underlying `cause`.
   * @param code Error code override, used by subclasses only.
   * @internal
   */
  constructor(
    message: string,
    options?: { cause?: unknown },
    code: LineBizErrorCode = LineBizErrorCode.CONNECTION_ERROR,
  ) {
    super(code, message, options);
    this.name = "ConnectionError";
  }
}

/** Thrown when a request exceeds its timeout. */
export class TimeoutError extends ConnectionError {
  /**
   * @param message Human-readable message.
   * @param options Optional underlying `cause`.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options, LineBizErrorCode.TIMEOUT);
    this.name = "TimeoutError";
  }
}

/** Thrown when a request is aborted by the caller's `AbortSignal`. */
export class AbortError extends LineBizError {
  /**
   * @param message Human-readable message.
   * @param options Optional underlying `cause`.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(LineBizErrorCode.ABORTED, message, options);
    this.name = "AbortError";
  }
}

/** Thrown when the server responds with something the SDK cannot interpret. */
export class UnexpectedResponseError extends LineBizError {
  /** HTTP status of the response, if known. */
  readonly status?: number;
  /** Response body (parsed JSON or truncated text), if known. */
  readonly body?: unknown;
  /** Redirect `Location` header, if any. */
  readonly location?: string;

  /**
   * @param message Human-readable message.
   * @param options Optional response details and `cause`.
   */
  constructor(
    message: string,
    options?: { status?: number; body?: unknown; location?: string; cause?: unknown },
  ) {
    super(LineBizErrorCode.UNEXPECTED_RESPONSE, message, { cause: options?.cause });
    this.name = "UnexpectedResponseError";
    if (options?.status !== undefined) this.status = options.status;
    if (options?.body !== undefined) this.body = options.body;
    if (options?.location !== undefined) this.location = options.location;
  }
}

/** Raw data needed to construct an {@link APIError}. */
export interface APIErrorInit {
  /** HTTP status code. */
  status: number;
  /** Parsed JSON body, or truncated text. */
  body: unknown;
  /** Response headers with lowercase keys. */
  headers: Record<string, string>;
  /** HTTP method of the failed request. */
  method: string;
  /** URL of the failed request. */
  url: string;
}

/** Thrown when the API responds with a non-success HTTP status. */
export class APIError extends LineBizError {
  /** HTTP status code. */
  readonly status: number;
  /** Parsed JSON body, or truncated text. */
  readonly body: unknown;
  /** Response headers (`cookie` / `set-cookie` redacted). */
  readonly headers: Record<string, string>;
  /** HTTP method of the failed request. */
  readonly method: string;
  /** URL of the failed request. */
  readonly url: string;

  /**
   * @param init Response details.
   * @param code Error code override, used by subclasses only.
   * @internal
   */
  constructor(init: APIErrorInit, code: LineBizErrorCode = LineBizErrorCode.API_ERROR) {
    super(code, `${init.method} ${init.url} failed with status ${String(init.status)}`);
    this.name = "APIError";
    this.status = init.status;
    this.body = init.body;
    this.headers = redactHeaders(init.headers);
    this.method = init.method;
    this.url = init.url;
  }

  /**
   * Build the most specific {@link APIError} subclass for the given status.
   *
   * @param init Response details; `headers` must have lowercase keys.
   * @returns An `APIError` (or subclass) instance.
   */
  static from(init: APIErrorInit): APIError {
    const { status } = init;
    if (status === 401) return new AuthenticationError(init);
    if (status === 403) return new PermissionDeniedError(init);
    if (status === 404) return new NotFoundError(init);
    if (status === 429) return new RateLimitError(init);
    if (status >= 500) return new InternalServerError(init);
    return new APIError(init);
  }
}

/** HTTP 401. Code is `SESSION_EXPIRED` when the body code is `not_login`, else `UNAUTHORIZED`. */
export class AuthenticationError extends APIError {
  /** @param init Response details. */
  constructor(init: APIErrorInit) {
    const body = init.body;
    const expired =
      typeof body === "object" &&
      body !== null &&
      (body as { code?: unknown }).code === "not_login";
    super(init, expired ? LineBizErrorCode.SESSION_EXPIRED : LineBizErrorCode.UNAUTHORIZED);
    this.name = "AuthenticationError";
  }
}

/** HTTP 403. */
export class PermissionDeniedError extends APIError {
  /** @param init Response details. */
  constructor(init: APIErrorInit) {
    super(init, LineBizErrorCode.PERMISSION_DENIED);
    this.name = "PermissionDeniedError";
  }
}

/** HTTP 404. */
export class NotFoundError extends APIError {
  /** @param init Response details. */
  constructor(init: APIErrorInit) {
    super(init, LineBizErrorCode.NOT_FOUND);
    this.name = "NotFoundError";
  }
}

/** HTTP 429. */
export class RateLimitError extends APIError {
  /** Delay in milliseconds requested via `Retry-After`, if present and parseable. */
  readonly retryAfter: number | undefined;

  /** @param init Response details. */
  constructor(init: APIErrorInit) {
    super(init, LineBizErrorCode.RATE_LIMITED);
    this.name = "RateLimitError";
    this.retryAfter = parseRetryAfter(init.headers["retry-after"] ?? null);
  }
}

/** HTTP 5xx. */
export class InternalServerError extends APIError {
  /** @param init Response details. */
  constructor(init: APIErrorInit) {
    super(init, LineBizErrorCode.SERVER_ERROR);
    this.name = "InternalServerError";
  }
}

/**
 * Type guard for errors thrown by this SDK.
 *
 * @param value Any value.
 * @returns `true` if `value` is a {@link LineBizError} (including subclasses).
 */
export function isLineBizError(value: unknown): value is LineBizError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}

/**
 * Return a copy of `headers` with `cookie` and `set-cookie` values replaced by `"[REDACTED]"`.
 *
 * @param headers Header map.
 * @returns A new, redacted header map.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    out[key] = lower === "cookie" || lower === "set-cookie" ? REDACTED : value;
  }
  return out;
}

/**
 * Truncate response text to at most 2,000 characters.
 *
 * @param text Raw text.
 * @returns The (possibly shortened) text.
 */
export function truncateBody(text: string): string {
  return text.length > MAX_BODY_LENGTH ? text.slice(0, MAX_BODY_LENGTH) : text;
}
