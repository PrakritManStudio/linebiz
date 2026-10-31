English | [ภาษาไทย](./README.th.md)

# @prakrit_m/linebiz

Unofficial TypeScript client for the LINE Official Account (LINE OA) web APIs on `chat.line.biz`, authenticated with browser session cookies. Zero runtime dependencies, ESM-only, fully typed.

## Disclaimer

- This is an **unofficial** project. It is **not affiliated with or endorsed by LY Corporation / LINE**.
- It relies on **undocumented internal web APIs** that were reverse-engineered from the LINE OA web app. They can change or break at any time without notice.
- Using it may violate LINE's terms of service. You are solely responsible for how you use it.
- Session cookies are credentials. **Never commit cookies** (or files that contain them) to a repository, and never paste them into issues or logs.

## Install

```sh
pnpm add @prakrit_m/linebiz
# or: npm install @prakrit_m/linebiz
```

Requires Node.js >= 22. The package is **ESM-only**:

```ts
import { LineBizClient } from "@prakrit_m/linebiz";
```

From CommonJS, `require("@prakrit_m/linebiz")` works on Node.js >= 22.12 (where `require(esm)` is enabled by default). On Node.js 22.0 to 22.11 use dynamic `import()` instead.

Types are available from the root and from the `@prakrit_m/linebiz/types` subpath.

## Quick start

```ts
import { LineBizClient } from "@prakrit_m/linebiz";

const cookies = process.env.LINEBIZ_COOKIES;
if (!cookies) throw new Error("Set LINEBIZ_COOKIES to your chat.line.biz session cookies");

const client = new LineBizClient({ cookies });

const me = await client.me.retrieve();
console.log(me.name);

// Awaiting a list gives the first page ...
const firstPage = await client.bots.list({ limit: 10 });
console.log(firstPage.data.map((bot) => bot.name));

// ... and iterating it walks every item across all pages.
for await (const bot of client.bots.list()) {
  console.log(bot.botId, bot.name);
}
```

Every method returns a Promise that rejects on failure; none throw synchronously (the constructor is the exception: invalid options throw a `ConfigError`).

## Cookies

You need the cookies of a logged-in `chat.line.biz` browser session. Pass them with the `cookies` option in any of three forms:

```ts
// The cookie names and values below are placeholders.

// 1. A Cookie header string (domain .line.biz, path / is assumed)
new LineBizClient({ cookies: "name1=value1; name2=value2" });

// 2. An array of cookie objects, e.g. from Playwright's context.cookies(),
//    Puppeteer's page.cookies() or a Cookie-Editor export
new LineBizClient({
  cookies: [
    { name: "name1", value: "value1", domain: ".line.biz", path: "/", secure: true },
    { name: "name2", value: "value2", domain: "chat.line.biz", path: "/" },
  ],
});

// 3. A JSON string containing such an array
new LineBizClient({ cookies: await readFile("cookies.json", "utf8") });
```

A string that starts with `[` is parsed as JSON; any other string is a Cookie header. Only cookies for `line.biz` (or `*.line.biz`) are kept, and expired cookies are dropped. Malformed input throws a `ConfigError` with code `INVALID_COOKIE` that names the offending entry (it never contains cookie names or values). Cookies are only sent to matching domains, paths and schemes.

Responses can rotate the session (`Set-Cookie`); the built-in `MemoryCookieStore` applies those updates. To save the current session:

```ts
const cookies = await client.exportCookies(); // CookieObject[]
```

`exportCookies()` only works with the built-in store; with a custom `cookieStore` it rejects with a `ConfigError`.

### Custom `CookieStore`

Pass `cookieStore` instead of `cookies` to keep the session somewhere else. A store implements:

```ts
interface CookieStore {
  getCookieHeader(url: URL): string | Promise<string>;
  setCookies?(url: URL, setCookie: string[]): void | Promise<void>;
}
```

The following is an **example sketch only** (a Redis-backed store; the `redis` object is a stand-in for whatever client you use, and the SDK does not depend on it). It reuses `MemoryCookieStore` for the cookie matching rules and persists the jar after every update:

```ts
import { LineBizClient, MemoryCookieStore } from "@prakrit_m/linebiz";
import type { CookieStore } from "@prakrit_m/linebiz";

// Minimal shape of the Redis client used below (example only).
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

class RedisCookieStore implements CookieStore {
  readonly #redis: RedisLike;
  readonly #key: string;
  readonly #jar: MemoryCookieStore;

  private constructor(redis: RedisLike, key: string, jar: MemoryCookieStore) {
    this.#redis = redis;
    this.#key = key;
    this.#jar = jar;
  }

  /** Loads the saved session from Redis, falling back to `seed` on first use. */
  static async create(redis: RedisLike, key: string, seed: string): Promise<RedisCookieStore> {
    const saved = await redis.get(key);
    return new RedisCookieStore(redis, key, new MemoryCookieStore(saved ?? seed));
  }

  getCookieHeader(url: URL): string {
    return this.#jar.getCookieHeader(url);
  }

  async setCookies(url: URL, setCookie: string[]): Promise<void> {
    this.#jar.setCookies(url, setCookie);
    await this.#redis.set(this.#key, JSON.stringify(this.#jar.toJSON()));
  }
}

const cookieStore = await RedisCookieStore.create(redis, "linebiz:session", seedCookies);
const client = new LineBizClient({ cookieStore });
```

Provide exactly one of `cookies` and `cookieStore`.

## Client options

All options are optional except that exactly one of `cookies` / `cookieStore` is required.

| Option          | Type                               | Default                                   | Description                                                                                                      |
| --------------- | ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cookies`       | `string \| CookieObject[]`         | -                                         | Session cookies (header string, JSON string, or cookie objects). Mutually exclusive with `cookieStore`.          |
| `cookieStore`   | `CookieStore`                      | -                                         | Custom cookie storage. Mutually exclusive with `cookies`.                                                        |
| `baseURLs`      | `Partial<Record<Service, string>>` | chat/manager/account `https://*.line.biz` | Override a service base URL (`"chat"`, `"manager"`, `"account"`), e.g. for a mock server. Must be http(s).       |
| `fetch`         | `typeof fetch`                     | `globalThis.fetch`                        | Custom `fetch` implementation.                                                                                   |
| `headers`       | `Record<string, string>`           | `{}`                                      | Extra headers on every request (override the defaults).                                                          |
| `userAgent`     | `string`                           | A current Chrome user agent               | `User-Agent` header.                                                                                             |
| `clientVersion` | `string`                           | `"20240513144702"`                        | Value of the `x-oa-chat-client-version` header (sent to the `chat` service).                                     |
| `timeout`       | `number`                           | `30000`                                   | Request timeout in ms (positive integer). Applies per attempt.                                                   |
| `maxRetries`    | `number`                           | `2`                                       | Retries for failed **GET** requests, integer 0-10. See below.                                                    |
| `validate`      | `boolean`                          | `true`                                    | Validate arguments on the client side. `false` skips format, range and enum checks only; type checks always run. |
| `hooks`         | `Hooks`                            | `{}`                                      | `onRequest` / `onResponse` / `onError` callbacks. See [Hooks](#hooks).                                           |

Invalid options throw a `ConfigError` (code `INVALID_OPTIONS`) from the constructor.

**Per-call options.** The last parameter of every method is an optional `RequestOptions`:

```ts
interface RequestOptions {
  signal?: AbortSignal; // abort the call
  timeout?: number; // override the client timeout (ms)
  headers?: Record<string, string>; // override/add headers for this call
}

const controller = new AbortController();
await client.bots.retrieve(botId, { signal: controller.signal, timeout: 5_000 });
```

For paginated calls the options apply to every page request. Header precedence: SDK defaults < client `headers` < per-call `headers`.

**Retries.** Only `GET` requests are retried, and only after a network error, a timeout, or HTTP 408 / 429 / 5xx. The delay is exponential backoff (`min(0.5s * 2^attempt, 8s)`, +/-25% jitter); a `Retry-After` header (seconds or HTTP date, capped at 60 s) is honored. Aborting with your own `AbortSignal` is never retried, and `POST` requests (such as `auth.logout()`) are never retried.

**Derived clients.** `client.withOptions({ ... })` returns a new client with some options changed (anything except `cookies` / `cookieStore`); the original is untouched and the cookie store is shared. The merge is **shallow**: a `headers`, `baseURLs` or `hooks` object you pass replaces the original object instead of being merged into it.

```ts
const fast = client.withOptions({ timeout: 5_000, maxRetries: 0 });
```

## Pagination

List methods that page (`bots.list`, `chats.list`, `messages.list`, `contacts.list`, `members.list`) return a `PagePromise<T>`. It can be used four ways:

```ts
// 1. await: the first page
const page = await client.chats.list(botId, { limit: 25 });
console.log(page.data.length, page.hasNextPage(), page.nextCursor);

// Walk pages manually (getNextPage() rejects if there is no next page)
if (page.hasNextPage()) {
  const second = await page.getNextPage();
}

// 2. for await: every item, pages are fetched lazily, break to stop early
for await (const chat of client.chats.list(botId)) {
  if (chat.done) continue;
  console.log(chat.chatId);
}

// 3. toArray: collect items, with optional limits
const firstHundred = await client.contacts.list(botId).toArray({ maxItems: 100 });
const twoPages = await client.chats.list(botId).toArray({ maxPages: 2 });

// 4. cursor: resume from a saved cursor
const resumed = await client.chats.list(botId, { cursor: page.nextCursor });
```

`Page<T>` has `data: T[]`, `nextCursor: string | undefined`, `raw` (the unmodified response body), `hasNextPage()` and `getNextPage()`. Pages are fetched sequentially. For `messages.list` the cursor is the `backward` cursor and following pages go further back in time. If the server returns a cursor that did not advance, the call rejects with an `UnexpectedResponseError` instead of looping forever.

## Errors

Every error extends `LineBizError` and has a machine-readable `code` (the `LineBizErrorCode` constants). Use `isLineBizError(e)` to narrow `unknown`.

| Class                     | `code`                                                    | When                                                                                                                                |
| ------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ConfigError`             | `INVALID_OPTIONS`, `INVALID_COOKIE`                       | Bad client options or cookies; also `exportCookies()` with a custom store                                                           |
| `ValidationError`         | `INVALID_PARAMETER`                                       | Bad method argument; has `.param`, `.value`, `.reason`                                                                              |
| `ConnectionError`         | `CONNECTION_ERROR`                                        | Network failure                                                                                                                     |
| `TimeoutError`            | `TIMEOUT`                                                 | Request exceeded its timeout (extends `ConnectionError`)                                                                            |
| `AbortError`              | `ABORTED`                                                 | Aborted via your `AbortSignal`                                                                                                      |
| `UnexpectedResponseError` | `UNEXPECTED_RESPONSE`                                     | Unparseable or unexpected response (invalid JSON, redirect, missing `list`, no next page); optional `.status`, `.body`, `.location` |
| `APIError`                | `API_ERROR`                                               | Any other non-2xx status; has `.status`, `.body`, `.headers`, `.method`, `.url`                                                     |
| `AuthenticationError`     | `SESSION_EXPIRED` (body code `not_login`), `UNAUTHORIZED` | HTTP 401 (extends `APIError`)                                                                                                       |
| `PermissionDeniedError`   | `PERMISSION_DENIED`                                       | HTTP 403 (extends `APIError`)                                                                                                       |
| `NotFoundError`           | `NOT_FOUND`                                               | HTTP 404 (extends `APIError`)                                                                                                       |
| `RateLimitError`          | `RATE_LIMITED`                                            | HTTP 429 (extends `APIError`); `.retryAfter` in ms, or `undefined`                                                                  |
| `InternalServerError`     | `SERVER_ERROR`                                            | HTTP 5xx (extends `APIError`)                                                                                                       |

`APIError.body` is the parsed JSON when possible, otherwise the response text truncated to 2,000 characters. Cookies never appear in error messages or fields: `cookie` and `set-cookie` headers are replaced with `"[REDACTED]"`.

```ts
import { AuthenticationError, LineBizErrorCode, isLineBizError } from "@prakrit_m/linebiz";

try {
  await client.me.retrieve();
} catch (error) {
  if (error instanceof AuthenticationError && error.code === LineBizErrorCode.SESSION_EXPIRED) {
    // The cookies are no longer valid: log in again and create a new client.
  } else if (isLineBizError(error)) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

## Hooks

Hooks are for logging and metrics. Their context never contains cookie values (`cookie` / `set-cookie` are redacted).

```ts
const client = new LineBizClient({
  cookies, // see Quick start
  hooks: {
    onRequest: ({ method, url, attempt }) => {
      console.log(`-> ${method} ${url} (attempt ${attempt})`);
    },
    onResponse: ({ method, url, status, durationMs }) => {
      console.log(`<- ${status} ${method} ${url} ${Math.round(durationMs)}ms`);
    },
    onError: ({ method, url, error }) => {
      console.error(`!! ${method} ${url}: ${error.code}`);
    },
  },
});
```

- `onRequest` runs before every attempt (including retries); if it throws, the call rejects with that error.
- `onResponse` runs for every received response, whatever the status.
- `onError` runs once with the final error when a call fails.
- Errors thrown by `onResponse` and `onError` are ignored.

## Resources

All current endpoints use the `chat` service (`chat.line.biz`). Paginated methods return a `PagePromise` (see [Pagination](#pagination)). IDs (`botId`, `chatId`, user IDs) are 33-character alphanumeric strings.

| Method                                                                            | Returns                     | Notes                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `me.retrieve()`                                                                   | `Promise<Me>`               | The signed-in user                                                                                                                                                                                             |
| `bots.list({ limit?, cursor? })`                                                  | `PagePromise<Bot>`          | `limit` 1-1000 (default 1000)                                                                                                                                                                                  |
| `bots.retrieve(botId)`                                                            | `Promise<BotDetail>`        |                                                                                                                                                                                                                |
| `owners.list(botId, { bizIds? })`                                                 | `Promise<Owner[]>`          | `bizIds`: list of UUIDs                                                                                                                                                                                        |
| `tags.list(botId, { tagIds? })`                                                   | `Promise<Tag[]>`            | `tagIds`: letters, digits, `-`, `_`                                                                                                                                                                            |
| `chats.list(botId, { limit?, tagIds?, folderType?, prioritizePinned?, cursor? })` | `PagePromise<Chat>`         | `limit` 1-25 (default 25); `folderType` default `"ALL"`; `prioritizePinned` default `true`                                                                                                                     |
| `messages.list(botId, chatId, { cursor? })`                                       | `PagePromise<MessageEvent>` | Newest first; cursor goes backward in time                                                                                                                                                                     |
| `messages.retrieveFlex(botId, chatId, messageId, { timestamp? })`                 | `Promise<FlexContainer>`    | `messageId` / `timestamp`: digit strings                                                                                                                                                                       |
| `contacts.list(botId, { query?, filter?, sortBy?, order?, limit?, cursor? })`     | `PagePromise<Contact>`      | `limit` 1-100 (default 20); `filter` `ALL \| FRIEND \| NOT_FRIEND \| GROUP \| SPAM` (default `ALL`); `sortBy` `DISPLAY_NAME \| LAST_TALKED_AT` (default `DISPLAY_NAME`); `order` `ASC \| DESC` (default `ASC`) |
| `members.list(botId, chatId, { userIds?, limit?, cursor? })`                      | `PagePromise<Member>`       | `limit` 1-100 (default 100)                                                                                                                                                                                    |
| `auth.logout()`                                                                   | `Promise<void>`             | Signs the web session out; the logout URL must be an https `*.line.biz` / `*.line.me` address                                                                                                                  |

Every method also accepts a trailing `RequestOptions`, for example `client.tags.list(botId, {}, { signal })`.

```ts
const [bot] = await client.bots.list({ limit: 1 }).toArray({ maxItems: 1 });
if (bot) {
  const tags = await client.tags.list(bot.botId);

  const friends = await client.contacts
    .list(bot.botId, { filter: "FRIEND", sortBy: "LAST_TALKED_AT", order: "DESC" })
    .toArray({ maxItems: 50 });

  const chat = await client.chats.list(bot.botId, { limit: 1 });
  const chatId = chat.data[0]?.chatId;
  if (chatId) {
    for await (const event of client.messages.list(bot.botId, chatId)) {
      console.log(event.type, event.timestamp);
    }
  }
}
```

Note that `me.retrieve()` returns a `localStorageEncryptionKey` field; treat the response as sensitive and do not log it.

## Integration tests

The repository has a read-only live test suite that talks to the real service. It is skipped unless you provide credentials through environment variables:

| Variable          | Required | Description                                                           |
| ----------------- | -------- | --------------------------------------------------------------------- |
| `LINEBIZ_COOKIES` | yes      | Session cookies (any accepted input form)                             |
| `LINEBIZ_BOT_ID`  | no       | Bot ID, enables the tests that need a bot (`chats.list`, `tags.list`) |

```sh
LINEBIZ_COOKIES='name1=value1; name2=value2' LINEBIZ_BOT_ID=<your bot id> pnpm test:integration
```

Without `LINEBIZ_COOKIES` every test is skipped and the command exits with code 0. The suite never calls `auth.logout()`. Do not commit cookies; `.env*` files are git-ignored.

## License

[ISC](./LICENSE). Type definitions inlined from `@line/bot-sdk` in the published `.d.ts` files are licensed under Apache-2.0; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
