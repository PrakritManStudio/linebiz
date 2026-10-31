/** Upper bound (ms) honoured for a server-provided `Retry-After` value. */
const MAX_RETRY_AFTER_MS = 60_000;
/** Base delay (ms) for exponential backoff. */
const BACKOFF_BASE_MS = 500;
/** Maximum delay (ms) before jitter for exponential backoff. */
const BACKOFF_MAX_MS = 8000;

/**
 * Parse an HTTP `Retry-After` header value into milliseconds.
 *
 * Accepts either a number of seconds or an HTTP-date. The result is capped at 60 seconds.
 *
 * @param value Raw header value, or `null` when the header is absent.
 * @param now Current time in epoch milliseconds (injectable for tests).
 * @returns Delay in milliseconds, or `undefined` when the value cannot be parsed.
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - now, 0), MAX_RETRY_AFTER_MS);
}

/**
 * Compute the exponential backoff delay (with +/-25% jitter) for a retry attempt.
 *
 * @param attempt Zero-based attempt number.
 * @param random Random source returning a value in `[0, 1)` (injectable for tests).
 * @returns Delay in milliseconds.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS) * (0.75 + random() * 0.5);
}

/**
 * Whether an HTTP status code is considered transient and safe to retry.
 *
 * @param status HTTP status code.
 * @returns `true` for 408, 429 and any 5xx status.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
