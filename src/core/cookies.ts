import { ConfigError } from "./errors.js";

/** A single browser cookie as accepted by the SDK. */
export interface CookieObject {
  /** Cookie name. */
  name: string;
  /** Cookie value. */
  value: string;
  /** Cookie domain; a leading dot means the cookie also applies to subdomains. */
  domain?: string;
  /** Cookie path. */
  path?: string;
  /** Expiry as seconds since the epoch; `-1` or absent means a session cookie. */
  expires?: number;
  /** Whether the cookie is only sent over HTTPS. */
  secure?: boolean;
  /** Whether the cookie is hidden from client-side scripts. */
  httpOnly?: boolean;
  /** SameSite attribute. */
  sameSite?: "Strict" | "Lax" | "None";
}

/** Accepted cookie input: a `Cookie` header string, a JSON array string, or an array of cookie objects. */
export type CookieInput = string | CookieObject[];

/** Pluggable cookie storage used by the client to read and update the session. */
export interface CookieStore {
  /** Returns the value of the `Cookie` request header for the given URL. */
  getCookieHeader(url: URL): string | Promise<string>;
  /** Optionally receives `Set-Cookie` header values from a response for the given URL. */
  setCookies?(url: URL, setCookie: string[]): void | Promise<void>;
}

const DEFAULT_DOMAIN = ".line.biz";
const DEFAULT_PATH = "/";
const ROOT_DOMAIN = "line.biz";

function fail(message: string): never {
  throw new ConfigError(message, { code: "INVALID_COOKIE" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHeader(input: string): CookieObject[] {
  const cookies: CookieObject[] = [];
  input.split(";").forEach((segment, index) => {
    const pair = segment.trim();
    if (pair === "") return;
    const eq = pair.indexOf("=");
    if (eq <= 0) fail(`Invalid cookie pair at position ${String(index)}`);
    cookies.push({
      name: pair.slice(0, eq).trim(),
      value: pair.slice(eq + 1).trim(),
      domain: DEFAULT_DOMAIN,
      path: DEFAULT_PATH,
    });
  });
  return cookies;
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    // The native SyntaxError message can quote the input, so it is deliberately dropped.
    return fail("Invalid cookies JSON: malformed JSON");
  }
}

function normalizeSameSite(value: unknown): CookieObject["sameSite"] {
  if (typeof value !== "string") return undefined;
  switch (value.toLowerCase()) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "none":
    case "no_restriction":
      return "None";
    default:
      return undefined;
  }
}

function optionalString(
  raw: Record<string, unknown>,
  index: number,
  field: string,
): string | undefined {
  const value = raw[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(`cookies[${String(index)}].${field} must be a string`);
  return value;
}

function normalizeEntry(entry: unknown, index: number): CookieObject {
  if (!isRecord(entry)) fail(`cookies[${String(index)}] must be an object`);
  const name = entry.name;
  if (typeof name !== "string") fail(`cookies[${String(index)}].name must be a string`);
  const value = entry.value;
  if (typeof value !== "string") fail(`cookies[${String(index)}].value must be a string`);

  let domain = optionalString(entry, index, "domain") ?? DEFAULT_DOMAIN;
  if (entry.hostOnly === true) domain = domain.replace(/^\./, "");
  else if (entry.hostOnly === false && !domain.startsWith(".")) domain = `.${domain}`;

  const cookie: CookieObject = {
    name,
    value,
    domain,
    path: optionalString(entry, index, "path") ?? DEFAULT_PATH,
  };

  if (entry.session !== true) {
    const expires = entry.expires ?? entry.expirationDate;
    if (typeof expires === "number" && Number.isFinite(expires)) cookie.expires = expires;
  }
  if (typeof entry.secure === "boolean") cookie.secure = entry.secure;
  if (typeof entry.httpOnly === "boolean") cookie.httpOnly = entry.httpOnly;
  const sameSite = normalizeSameSite(entry.sameSite);
  if (sameSite !== undefined) cookie.sameSite = sameSite;
  return cookie;
}

function isLineBizDomain(domain: string | undefined): boolean {
  const bare = (domain ?? DEFAULT_DOMAIN).replace(/^\./, "").toLowerCase();
  return bare === ROOT_DOMAIN || bare.endsWith(`.${ROOT_DOMAIN}`);
}

/**
 * Parses and normalizes user-supplied cookies into {@link CookieObject}s.
 *
 * Accepts a `Cookie` header string (`a=1; b=2`), a JSON string containing an array,
 * or an array of cookie objects (Playwright, Puppeteer or Cookie-Editor exports).
 * Cookies outside `*.line.biz` and already-expired cookies are dropped.
 *
 * @param input Raw cookie input.
 * @param now Current time in milliseconds since the epoch (defaults to `Date.now()`).
 * @returns The normalized cookies, never empty.
 * @throws {ConfigError} With code `INVALID_COOKIE` when the input is malformed or yields no usable cookie.
 *   Messages never contain cookie names or values.
 */
export function parseCookieInput(input: unknown, now: number = Date.now()): CookieObject[] {
  let parsed: unknown = input;
  if (typeof input === "string") {
    parsed = input.trim().startsWith("[") ? parseJson(input.trim()) : parseHeader(input);
  }
  if (!Array.isArray(parsed)) fail("cookies must be a string or an array");

  const cookies = (parsed as unknown[])
    .map((entry, index) => normalizeEntry(entry, index))
    .filter((c) => isLineBizDomain(c.domain))
    .filter((c) => !(c.expires !== undefined && c.expires > 0 && c.expires * 1000 <= now));

  if (cookies.length === 0) fail("No cookies for *.line.biz found");
  return cookies;
}
