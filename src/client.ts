import { MemoryCookieStore } from "./core/cookies.js";
import type { CookieInput, CookieObject, CookieStore } from "./core/cookies.js";
import { ConfigError } from "./core/errors.js";
import {
  HttpClient,
  MAX_TIMEOUT_MS,
  describeHeaderProblem,
  findHeaderProblem,
} from "./core/http.js";
import type { Hooks } from "./core/http.js";
import { DEFAULT_BASE_URLS, DEFAULT_CLIENT_VERSION, DEFAULT_USER_AGENT } from "./core/services.js";
import type { Service } from "./core/services.js";
import { Validator } from "./core/validate.js";
import { AuthResource } from "./resources/auth.js";
import { BotsResource } from "./resources/bots.js";
import { ChatsResource } from "./resources/chats.js";
import { ContactsResource } from "./resources/contacts.js";
import { MeResource } from "./resources/me.js";
import { MembersResource } from "./resources/members.js";
import { MessagesResource } from "./resources/messages.js";
import { OwnersResource } from "./resources/owners.js";
import { TagsResource } from "./resources/tags.js";

/** Options of {@link LineBizClient}. Exactly one of `cookies` and `cookieStore` is required. */
export interface ClientOptions {
  /** Session cookies: a `Cookie` header string, a JSON array string, or cookie objects. */
  cookies?: CookieInput;
  /** Custom cookie storage; use instead of `cookies`. */
  cookieStore?: CookieStore;
  /** Override the base URL of individual services (for example a local mock server). */
  baseURLs?: Partial<Record<Service, string>>;
  /** `fetch` implementation (default `globalThis.fetch`). */
  fetch?: typeof globalThis.fetch;
  /** Headers added to every request. */
  headers?: Record<string, string>;
  /** `User-Agent` header (default: a current Chrome UA). */
  userAgent?: string;
  /** Value of the `x-oa-chat-client-version` header (default `"20240513144702"`). */
  clientVersion?: string;
  /** Request timeout in milliseconds, a positive integer (default 30000). */
  timeout?: number;
  /** Maximum retries of failed GET requests, an integer from 0 to 10 (default 2). */
  maxRetries?: number;
  /** Validate method arguments on the client side (default `true`). */
  validate?: boolean;
  /** Observability hooks; cookies are redacted from their context. */
  hooks?: Hooks;
}

const SERVICES: readonly string[] = ["chat", "manager", "account"];

function invalid(message: string): never {
  throw new ConfigError(message, { code: "INVALID_OPTIONS" });
}

function resolveCookieStore(options: ClientOptions): CookieStore {
  if (options.cookies !== undefined && options.cookieStore !== undefined) {
    return invalid('Provide either "cookies" or "cookieStore", not both');
  }
  if (options.cookieStore !== undefined) return options.cookieStore;
  if (options.cookies !== undefined) return new MemoryCookieStore(options.cookies);
  return invalid('Either "cookies" or "cookieStore" is required');
}

function resolveBaseURLs(overrides: ClientOptions["baseURLs"]): Record<Service, string> {
  const baseURLs: Record<Service, string> = { ...DEFAULT_BASE_URLS };
  if (overrides === undefined) return baseURLs;
  for (const [key, value] of Object.entries(overrides)) {
    if (!SERVICES.includes(key)) invalid(`Unknown service in "baseURLs": ${key}`);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return invalid(`"baseURLs.${key}" is not a valid URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      invalid(`"baseURLs.${key}" must use http or https`);
    }
    baseURLs[key as Service] = value;
  }
  return baseURLs;
}

function resolveInt(
  name: string,
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    invalid(`"${name}" must be an integer between ${String(min)} and ${String(max)}`);
  }
  return resolved;
}

/**
 * Client for the LINE Official Account web API (chat.line.biz).
 *
 * The client is immutable; use {@link LineBizClient.withOptions} to derive a variant.
 * Resource methods validate their arguments lazily, so they reject instead of throwing.
 * Invalid constructor options throw a {@link ConfigError} synchronously.
 */
export class LineBizClient {
  /** The signed-in user. */
  readonly me: MeResource;
  /** Bots (LINE Official Accounts). */
  readonly bots: BotsResource;
  /** Owners of a bot. */
  readonly owners: OwnersResource;
  /** Tags of a bot. */
  readonly tags: TagsResource;
  /** Chats of a bot. */
  readonly chats: ChatsResource;
  /** Messages of a chat. */
  readonly messages: MessagesResource;
  /** Contacts of a bot. */
  readonly contacts: ContactsResource;
  /** Members of a group chat. */
  readonly members: MembersResource;
  /** Sign-out of the web session. */
  readonly auth: AuthResource;

  /** @internal HTTP pipeline shared by the resources. */
  readonly _http: HttpClient;
  /** @internal Argument validator shared by the resources. */
  readonly _validator: Validator;

  readonly #options: Omit<ClientOptions, "cookies" | "cookieStore">;
  readonly #cookieStore: CookieStore;

  /**
   * @param options Client options; exactly one of `cookies` and `cookieStore` is required.
   * @throws {ConfigError} If an option is missing or invalid.
   */
  constructor(options: ClientOptions) {
    const cookieStore = resolveCookieStore(options);
    const baseURLs = resolveBaseURLs(options.baseURLs);
    const timeout = resolveInt("timeout", options.timeout, 30_000, 1, MAX_TIMEOUT_MS);
    const maxRetries = resolveInt("maxRetries", options.maxRetries, 2, 0, 10);
    const headerProblem = findHeaderProblem(options.headers ?? {});
    if (headerProblem !== undefined) invalid(describeHeaderProblem(headerProblem));

    const rest: Omit<ClientOptions, "cookies" | "cookieStore"> = { ...options };
    delete (rest as ClientOptions).cookies;
    delete (rest as ClientOptions).cookieStore;
    this.#options = rest;
    this.#cookieStore = cookieStore;
    this._http = new HttpClient({
      baseURLs,
      fetch: options.fetch ?? globalThis.fetch,
      headers: { ...options.headers },
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      clientVersion: options.clientVersion ?? DEFAULT_CLIENT_VERSION,
      timeout,
      maxRetries,
      cookieStore,
      hooks: options.hooks ?? {},
    });
    this._validator = new Validator(options.validate ?? true);

    this.me = new MeResource(this);
    this.bots = new BotsResource(this);
    this.owners = new OwnersResource(this);
    this.tags = new TagsResource(this);
    this.chats = new ChatsResource(this);
    this.messages = new MessagesResource(this);
    this.contacts = new ContactsResource(this);
    this.members = new MembersResource(this);
    this.auth = new AuthResource(this);
  }

  /**
   * Creates a new client with some options changed; the original client is not modified.
   * Options are merged shallowly over the original ones: a provided `headers`, `baseURLs`
   * or `hooks` object replaces the original one instead of being merged into it.
   * The new client shares the original cookie store, so session updates are visible to both.
   * @param options Options to override.
   * @returns A new client.
   * @throws {ConfigError} If an option is invalid.
   */
  withOptions(options: Omit<ClientOptions, "cookies" | "cookieStore">): LineBizClient {
    return new LineBizClient({ ...this.#options, ...options, cookieStore: this.#cookieStore });
  }

  /**
   * Exports the current session cookies, including any updated by responses.
   * @returns The cookies.
   * @throws {ConfigError} If the client uses a custom cookie store (export from that store instead).
   */
  exportCookies(): Promise<CookieObject[]> {
    if (this.#cookieStore instanceof MemoryCookieStore) {
      return Promise.resolve(this.#cookieStore.toJSON());
    }
    return Promise.reject(
      new ConfigError("exportCookies() is only available with the built-in cookie store", {
        code: "INVALID_OPTIONS",
      }),
    );
  }
}
