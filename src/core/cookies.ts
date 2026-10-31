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

interface StoredCookie {
  name: string;
  value: string;
  /** Lowercase domain without a leading dot. */
  domain: string;
  hostOnly: boolean;
  path: string;
  /** Expiry in milliseconds since the epoch; `undefined` for session cookies. */
  expiresAt: number | undefined;
  secure: boolean;
  httpOnly: boolean;
  sameSite: CookieObject["sameSite"];
}

function cookieKey(name: string, domain: string, path: string): string {
  return `${name}\u0000${domain}\u0000${path}`;
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (cookiePath === "/" || requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

function defaultPath(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  const last = pathname.lastIndexOf("/");
  return last <= 0 ? "/" : pathname.slice(0, last);
}

/**
 * In-memory, domain-aware cookie jar implementing a subset of RFC 6265.
 *
 * It is the default {@link CookieStore} of the client. Cookies are only returned for
 * matching hosts, paths and schemes, and are updated from `Set-Cookie` response headers.
 */
export class MemoryCookieStore implements CookieStore {
  readonly #cookies = new Map<string, StoredCookie>();
  readonly #now: () => number;

  /**
   * @param input Initial cookies; omit to start with an empty store.
   * @param options Optional clock override (milliseconds since the epoch), mainly for tests.
   * @throws {ConfigError} With code `INVALID_COOKIE` when `input` is given but unusable.
   */
  constructor(input?: CookieInput, options?: { now?: () => number }) {
    this.#now = options?.now ?? Date.now;
    if (input === undefined) return;
    for (const c of parseCookieInput(input, this.#now())) {
      const hostOnly = !(c.domain ?? DEFAULT_DOMAIN).startsWith(".");
      const domain = (c.domain ?? DEFAULT_DOMAIN).replace(/^\./, "").toLowerCase();
      const path = c.path ?? DEFAULT_PATH;
      this.#cookies.set(cookieKey(c.name, domain, path), {
        name: c.name,
        value: c.value,
        domain,
        hostOnly,
        path,
        expiresAt: c.expires !== undefined && c.expires > 0 ? c.expires * 1000 : undefined,
        secure: c.secure === true,
        httpOnly: c.httpOnly === true,
        sameSite: c.sameSite,
      });
    }
  }

  /**
   * Builds the `Cookie` header value for a request URL.
   *
   * @param url The request URL.
   * @returns `name=value` pairs joined by `"; "` (longest path first), or `""` when none match.
   */
  getCookieHeader(url: URL): string {
    this.#purgeExpired();
    const host = url.hostname.toLowerCase();
    const requestPath = url.pathname === "" ? "/" : url.pathname;
    const secureRequest = url.protocol === "https:";
    return [...this.#cookies.values()]
      .filter(
        (c) =>
          (c.hostOnly ? host === c.domain : domainMatches(host, c.domain)) &&
          pathMatches(requestPath, c.path) &&
          (!c.secure || secureRequest),
      )
      .sort((a, b) => b.path.length - a.path.length)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  /**
   * Applies `Set-Cookie` header values received in a response from `url`.
   * Malformed or disallowed entries are ignored; this method never throws.
   *
   * @param url The URL the response came from.
   * @param setCookie Raw `Set-Cookie` header values.
   */
  setCookies(url: URL, setCookie: string[]): void {
    for (const header of setCookie) this.#applySetCookie(url, header);
  }

  /**
   * Exports the unexpired cookies.
   *
   * @returns Cookie objects; domain cookies have a leading dot, host-only cookies do not.
   *   `expires` is in seconds, or `-1` for session cookies.
   */
  toJSON(): CookieObject[] {
    this.#purgeExpired();
    return [...this.#cookies.values()].map((c) => {
      const out: CookieObject = {
        name: c.name,
        value: c.value,
        domain: c.hostOnly ? c.domain : `.${c.domain}`,
        path: c.path,
        expires: c.expiresAt === undefined ? -1 : c.expiresAt / 1000,
        secure: c.secure,
        httpOnly: c.httpOnly,
      };
      if (c.sameSite !== undefined) out.sameSite = c.sameSite;
      return out;
    });
  }

  #purgeExpired(): void {
    const now = this.#now();
    for (const [key, c] of this.#cookies) {
      if (c.expiresAt !== undefined && c.expiresAt <= now) this.#cookies.delete(key);
    }
  }

  #applySetCookie(url: URL, header: string): void {
    const [pair = "", ...attributes] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) return;
    const name = pair.slice(0, eq).trim();
    if (name === "") return;
    const value = pair.slice(eq + 1).trim();

    let domainAttr: string | undefined;
    let pathAttr: string | undefined;
    let maxAge: number | undefined;
    let expires: number | undefined;
    let secure = false;
    let httpOnly = false;
    let sameSite: CookieObject["sameSite"];
    for (const attribute of attributes) {
      const idx = attribute.indexOf("=");
      const key = (idx < 0 ? attribute : attribute.slice(0, idx)).trim().toLowerCase();
      const attrValue = idx < 0 ? "" : attribute.slice(idx + 1).trim();
      switch (key) {
        case "domain":
          if (attrValue !== "") domainAttr = attrValue.replace(/^\./, "").toLowerCase();
          break;
        case "path":
          if (attrValue.startsWith("/")) pathAttr = attrValue;
          break;
        case "max-age":
          if (/^-?\d+$/.test(attrValue)) maxAge = Number(attrValue);
          break;
        case "expires": {
          const parsed = Date.parse(attrValue);
          if (!Number.isNaN(parsed)) expires = parsed;
          break;
        }
        case "secure":
          secure = true;
          break;
        case "httponly":
          httpOnly = true;
          break;
        case "samesite":
          sameSite = normalizeSameSite(attrValue);
          break;
        default:
          break;
      }
    }

    const host = url.hostname.toLowerCase();
    if (domainAttr !== undefined && (!domainAttr.includes(".") || !domainMatches(host, domainAttr))) {
      return;
    }

    const lowerName = name.toLowerCase();
    if (lowerName.startsWith("__secure-") && !secure) return;
    if (
      lowerName.startsWith("__host-") &&
      (!secure || domainAttr !== undefined || pathAttr !== "/")
    ) {
      return;
    }

    const domain = domainAttr ?? host;
    const path = pathAttr ?? defaultPath(url.pathname);
    const key = cookieKey(name, domain, path);
    const now = this.#now();

    let expiresAt: number | undefined;
    if (maxAge !== undefined) {
      if (maxAge <= 0) {
        this.#cookies.delete(key);
        return;
      }
      expiresAt = now + maxAge * 1000;
    } else if (expires !== undefined) {
      if (expires <= now) {
        this.#cookies.delete(key);
        return;
      }
      expiresAt = expires;
    }

    this.#cookies.set(key, {
      name,
      value,
      domain,
      hostOnly: domainAttr === undefined,
      path,
      expiresAt,
      secure,
      httpOnly,
      sameSite,
    });
  }
}
