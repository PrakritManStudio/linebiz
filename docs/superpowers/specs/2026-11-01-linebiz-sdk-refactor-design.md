# LineBiz SDK Refactor — Design Spec

- **วันที่:** 2026-11-01
- **สถานะ:** อนุมัติแล้ว (2026-11-01)
- **แพ็กเกจเดิม:** `@prakrit_m/lineweb@1.0.0-beta.6`
- **แพ็กเกจใหม่:** `@prakrit_m/linebiz@0.1.0`

## 1. บริบทและเป้าหมาย

SDK นี้เป็น **unofficial** TypeScript client ที่แกะมาจาก web API ภายในของ LINE OA (`chat.line.biz` และโดเมน `*.line.biz` อื่น) ซึ่ง LINE เปลี่ยนได้ทุกเมื่อโดยไม่แจ้ง

เป้าหมาย: refactor ให้มีโครงสร้าง, DX, ความปลอดภัย, การทดสอบ และกระบวนการ release ตามมาตรฐาน SDK สากล (อ้างอิงแนวทาง Stripe / OpenAI / Anthropic SDK) พร้อมเปลี่ยนชื่อเป็น `linebiz`

**ข้อตกลงจากการคุย:**

- ผู้ใช้หลักคือผู้เขียนเองและทีม → **อนุญาต breaking change เต็มที่** ไม่ต้องมี compat shim
- ผู้ใช้ต้องปรับแต่ง client ได้ยืดหยุ่น (HTTP, cookie, หลายโดเมน)
- ยังไม่ทราบแหล่งที่มาของ cookie แน่ชัด → รองรับหลายรูปแบบ

**ความสำเร็จวัดจาก:**

1. Public API แบบ resource-based, type-safe, ไม่มี runtime dependency
2. Unit tests ครอบคลุม core (http, cookies, pagination, errors, validate) และทุก resource ผ่าน mock `fetch`
3. CI ผ่าน lint / typecheck / test (Node 22, 24, 26) / build / publint / attw
4. ไม่มี credential ใดอยู่ใน repo
5. บั๊กที่รู้แล้วถูกแก้ (ดู §13)

## 2. Non-goals

- ไม่รองรับ browser runtime (ต้องตั้ง `Cookie` header เอง + ติด CORS)
- ไม่รองรับ CommonJS build (ESM-only)
- ไม่ทำ compat layer สำหรับ API เดิมของ `lineweb`
- ไม่เพิ่ม endpoint ใหม่ใน refactor นี้ (endpoint ของ `manager.line.biz` จะมาจากรอบแกะ API ภายหลัง — §15) แต่โครงสร้างต้องรองรับ
- ไม่ใช้ schema validation library (zod ฯลฯ)
- ไม่ทำ `MIGRATION.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`

## 3. การตั้งชื่อ

| ส่วน          | เดิม                                       | ใหม่                                                       |
| ------------- | ------------------------------------------ | ---------------------------------------------------------- |
| npm package   | `@prakrit_m/lineweb`                       | `@prakrit_m/linebiz`                                       |
| Main class    | `LineWeb`                                  | `LineBizClient`                                            |
| Base error    | `LineWebError` / `LineWebErrorCode` (enum) | `LineBizError` / `LineBizErrorCode` (const object + union) |
| Type guard    | `isLineWebError`                           | `isLineBizError`                                           |
| GitHub repo   | `PrakritManStudio/lineweb`                 | `PrakritManStudio/linebiz`                                 |
| Types subpath | `./type`                                   | `./types`                                                  |
| เวอร์ชันแรก   | —                                          | `0.1.0`                                                    |

พารามิเตอร์ตัด prefix `web`: `webBotId` → `botId`, `webChatId` → `chatId`, `webUserIds` → `userIds`; `nextToken` / `backwardToken` → `cursor`

## 4. สถาปัตยกรรม

```
src/
  index.ts              public exports (client, errors, cookie store, types)
  client.ts             LineBizClient: รับ options, สร้าง resources, withOptions()
  core/
    http.ts             request pipeline: resolve URL → headers/cookies → timeout/abort
                        → retry/backoff → hooks → Set-Cookie → error mapping → JSON parse
    pagination.ts       Page<T>, PagePromise<T>, cursor strategies
    errors.ts           error hierarchy + codes + isLineBizError + redaction helper
    cookies.ts          cookie input parser, CookieStore interface, MemoryCookieStore
    validate.ts         assertion helpers
    services.ts         Service type, default base URLs, per-service default headers
  resources/
    me.ts bots.ts chats.ts messages.ts contacts.ts members.ts tags.ts owners.ts auth.ts
  types/
    index.ts + ไฟล์ type ต่อ resource (ย้ายจาก src/type/)
test/
  unit/ fixtures/ integration/
```

**หลักการ:** resource รู้เฉพาะ `service`, `path`, query และ cursor strategy ของตัวเอง; ทุกเรื่อง HTTP อยู่ที่ `core/http.ts` ที่เดียว ทุก resource extends `APIResource` ที่ถือ reference ไปยัง client

## 5. Client options

```ts
interface ClientOptions {
  cookies?: string | CookieObject[]; // ต้องระบุ cookies หรือ cookieStore อย่างใดอย่างหนึ่ง (ไม่ทั้งคู่)
  cookieStore?: CookieStore;
  baseURLs?: Partial<Record<Service, string>>;
  fetch?: typeof globalThis.fetch; // default: globalThis.fetch
  headers?: Record<string, string>; // เพิ่ม/override header ทุก request
  userAgent?: string; // default: Chrome UA ปัจจุบัน
  clientVersion?: string; // x-oa-chat-client-version, default "20240513144702"
  timeout?: number; // ms, default 30_000
  maxRetries?: number; // default 2
  validate?: boolean; // client-side param validation, default true
  hooks?: {
    onRequest?(ctx: RequestContext): void | Promise<void>;
    onResponse?(ctx: ResponseContext): void | Promise<void>;
    onError?(ctx: ErrorContext): void | Promise<void>;
  };
}

interface RequestOptions {
  // พารามิเตอร์ตัวสุดท้ายของทุกเมธอด
  signal?: AbortSignal;
  timeout?: number;
  headers?: Record<string, string>;
}
```

- Client เป็น immutable: ไม่มี public mutable field; `client.withOptions(partial)` คืน client ใหม่ (ใช้ cookie store เดียวกัน)
- `client.exportCookies(): Promise<CookieObject[]>` — มีเมื่อ store เป็น `MemoryCookieStore`; store อื่นให้ผู้ใช้จัดการเอง
- Hook context ทุกตัวผ่าน redaction (§9) แล้ว; hook ที่ throw จะไม่ทำให้ request ล้ม (จับแล้ว ignore) ยกเว้น `onRequest` ที่ throw → reject request ด้วย error นั้น

### Retry

- Retry เฉพาะ `GET` เมื่อ: network error, timeout, 408, 429, 5xx
- Exponential backoff: `min(0.5s * 2^attempt, 8s)` + jitter ±25%; ถ้ามี `Retry-After` (วินาทีหรือ HTTP date) ใช้ค่านั้น (cap 60s)
- ไม่ retry เมื่อ user abort

## 6. หลายโดเมนและ cookie

### Services

```ts
type Service = "chat" | "manager" | "account";
const DEFAULT_BASE_URLS = {
  chat: "https://chat.line.biz",
  manager: "https://manager.line.biz",
  account: "https://account.line.biz",
};
```

- Request descriptor: `{ service, method, path, query?, body? }` → `new URL(path, baseURLs[service])`
- Per-service default headers: `chat` ส่ง `x-oa-chat-client-version`; ทุก service ส่ง `User-Agent`, `Accept: application/json`; `Content-Type: application/json` เมื่อมี body
- Absolute URL (เช่น `logoutUri`) อนุญาตเฉพาะ host ที่ลงท้าย `.line.biz` หรือ `.line.me` (https เท่านั้น) มิฉะนั้น throw `ConfigError`/`UnexpectedResponseError`

### Cookie input (ชั้นที่ 1)

รับได้:

1. Cookie header string: `"a=1; b=2"` → ถือเป็น domain `.line.biz`, path `/`
2. `CookieObject[]`: `{ name, value, domain?, path?, expires?, secure?, httpOnly?, sameSite? }` (รูปแบบ Playwright / Puppeteer / Cookie-Editor; `expires` รับทั้ง seconds และ `-1`)
3. JSON string ของข้อ 2 (รูปแบบเดิม)

การตรวจรูปแบบ: string ที่ขึ้นต้นด้วย `[` → parse JSON; มิฉะนั้นถือเป็น header string. กรองเฉพาะ cookie ที่ domain match `line.biz` (หรือไม่มี domain). input ผิด → `ConfigError` ที่ระบุ index/field ที่ผิด

### CookieStore (ชั้นที่ 2)

```ts
interface CookieStore {
  getCookieHeader(url: URL): string | Promise<string>;
  setCookies?(url: URL, setCookie: string[]): void | Promise<void>;
}
```

`MemoryCookieStore` (default) — RFC 6265 subset:

- Domain matching: host-only vs domain cookie (`.line.biz` match ทุก subdomain)
- Path matching (prefix), expiry (ตัด cookie หมดอายุออก), `Secure` (ส่งเฉพาะ https), prefix `__Host-` (host-only, path `/`, secure)
- รับ `Set-Cookie` ผ่าน `response.headers.getSetCookie()` แล้ว upsert/ลบ (Max-Age ≤ 0 หรือ Expires ในอดีต = ลบ)
- `toJSON(): CookieObject[]` สำหรับ export

ผลด้านความปลอดภัย: cookie ถูกส่งเฉพาะโดเมนที่ match (ปิดปัญหาเดิมที่ `logout()` ส่ง cookie ทั้งหมดไปยัง URL ใดก็ได้ที่ server คืนมา)

## 7. Resources

ทุก endpoint ปัจจุบันอยู่บน service `chat`

| Method                                                                            | HTTP                                                                                           | Pagination | Validation                                                                                                                                      |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `me.retrieve()`                                                                   | `GET /api/v1/me`                                                                               | —          | —                                                                                                                                               |
| `bots.list({ limit?, cursor? })`                                                  | `GET /api/v1/bots?noFilter=true&limit&next`                                                    | `next`     | limit 1–1000 (default 1000)                                                                                                                     |
| `bots.retrieve(botId)`                                                            | `GET /api/v1/bots/{botId}?noFilter=true`                                                       | —          | botId                                                                                                                                           |
| `owners.list(botId, { bizIds? })`                                                 | `GET /api/v1/bots/{botId}/owners?bizIds`                                                       | —          | botId, bizIds = UUID list                                                                                                                       |
| `tags.list(botId, { tagIds? })`                                                   | `GET /api/v1/bots/{botId}/tags?tagIds`                                                         | —          | botId, tagIds                                                                                                                                   |
| `chats.list(botId, { limit?, tagIds?, folderType?, prioritizePinned?, cursor? })` | `GET /api/v2/bots/{botId}/chats?folderType&tagIds&autoTagIds=&limit&prioritizePinnedChat&next` | `next`     | limit 1–25 (default 25); folderType default `"ALL"`; prioritizePinned default `true`                                                            |
| `messages.list(botId, chatId, { cursor? })`                                       | `GET /api/v3/bots/{botId}/chats/{chatId}/messages?backward`                                    | `backward` | botId, chatId                                                                                                                                   |
| `messages.retrieveFlex(botId, chatId, messageId, { timestamp? })`                 | `GET /api/v1/bots/{botId}/chats/{chatId}/messages/flexJson?messageId&timestamp`                | —          | messageId/timestamp = digits                                                                                                                    |
| `contacts.list(botId, { query?, filter?, sortBy?, order?, limit?, cursor? })`     | `GET /api/v2/bots/{botId}/contacts?query&filterKey&sortKey&sortOrder&limit&next`               | `next`     | limit 1–100 (default 20); filter `ALL\|FRIEND\|NOT_FRIEND\|GROUP\|SPAM` (default ALL); sortBy `DISPLAY_NAME\|LAST_TALKED_AT`; order `ASC\|DESC` |
| `members.list(botId, chatId, { userIds?, limit?, cursor? })`                      | `GET /api/v1/bots/{botId}/chats/{chatId}/members?limit&userIds&next`                           | `next`     | limit 1–100 (default 100)                                                                                                                       |
| `auth.logout()`                                                                   | `POST /api/v1/logoutUri` body `{ redirectPath: "/" }` → `GET logoutUri`                        | —          | logoutUri allowlist (§6)                                                                                                                        |

Query string สร้างด้วย `URLSearchParams` (list join ด้วย `,`); path segment ผ่าน `encodeURIComponent`

### Types

- เปลี่ยนชื่อให้ตรง resource: `BotData` → `Bot`, `Bot` → `BotDetail`, `TagsData` → `Tag`, `OwnersList` → `Owner`, `MessageEventType` → `MessageEvent`; `Chat`, `Contact`, `Member`, `Me` คงชื่อ
- Response wrapper (`*Response`) ไม่ export แล้ว — ผู้ใช้เห็นเป็น `Page<T>` / `T[]`
- `FlexContainer` และ type ที่ตรงกับ LINE Messaging API ใช้จาก `@line/bot-sdk` (devDependency) โดยให้ tsdown inline ลง `.d.ts`; ยืนยันด้วย attw ว่า `.d.ts` ไม่ import `@line/bot-sdk`
- Export types ทั้งจาก root และ `@prakrit_m/linebiz/types`

## 8. Pagination

```ts
class Page<T> {
  readonly data: T[];
  readonly nextCursor: string | undefined;
  readonly raw: unknown;
  hasNextPage(): boolean;
  getNextPage(): Promise<Page<T>>; // throw ถ้าไม่มีหน้าถัดไป
}

class PagePromise<T> extends Promise<Page<T>> implements AsyncIterable<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>; // item-level, ข้ามหน้าอัตโนมัติ
  toArray(opts?: { maxPages?: number; maxItems?: number }): Promise<T[]>;
}
```

- Cursor strategy ต่อ endpoint: `{ requestParam: "next" | "backward", responseField: "next" | "backward", listField: "list" }`
- ดึงทีละหน้าแบบ sequential; `RequestOptions.signal` ส่งต่อไปทุกหน้า
- `list` ต้องเป็น array มิฉะนั้น `UnexpectedResponseError`
- ป้องกันลูปไม่จบ: ถ้า cursor ใหม่เท่ากับ cursor ที่เพิ่งใช้ → หยุดและ throw `UnexpectedResponseError`

## 9. Errors

```
LineBizError (code, message, cause)
├─ ConfigError                  code: INVALID_OPTIONS | INVALID_COOKIE
├─ ValidationError              code: INVALID_PARAMETER; .param .value .reason
├─ ConnectionError              code: CONNECTION_ERROR
│   └─ TimeoutError             code: TIMEOUT
├─ AbortError                   code: ABORTED
├─ UnexpectedResponseError      code: UNEXPECTED_RESPONSE; .status? .body?
└─ APIError                     .status .body .headers .method .url
    ├─ AuthenticationError 401  code: SESSION_EXPIRED (body.code === "not_login") | UNAUTHORIZED
    ├─ PermissionDeniedError 403  code: PERMISSION_DENIED
    ├─ NotFoundError 404        code: NOT_FOUND (รวม "not_found_operatable_bot")
    ├─ RateLimitError 429       code: RATE_LIMITED; .retryAfter (ms)
    ├─ InternalServerError 5xx  code: SERVER_ERROR
    └─ (status อื่น)             code: API_ERROR
```

- `LineBizErrorCode` เป็น `as const` object + `type LineBizErrorCode = typeof ...[keyof ...]`
- ใช้ ES2022 `super(message, { cause })`
- Brand: `Symbol.for("linebiz.error")` บน prototype; `isLineBizError(e)` ตรวจ brand
- `.body` เก็บ parsed JSON ถ้า parse ได้ ไม่งั้นเก็บ text (ตัดที่ 2,000 ตัวอักษร)
- **Redaction:** header `cookie`, `set-cookie` → `"[REDACTED]"` ในทุก error และ hook context; ไม่มี cookie value ใน `message`
- ทุกเมธอด public คืน Promise ที่ reject เสมอ (validation error ก็ reject ไม่ throw sync)

## 10. Validation (`core/validate.ts`)

```ts
assertId(param, value); // /^[A-Za-z0-9]{33}$/ (botId, chatId, userId)
assertIdList(param, value); // array ของ /^[A-Za-z0-9]+$/ (tagIds)
assertUuidList(param, value); // array ของ UUID (bizIds)
assertDigits(param, value); // /^[0-9]+$/ (messageId, timestamp)
assertInt(param, value, { min, max });
assertEnum(param, value, allowed);
```

- ทุกตัว throw `ValidationError` พร้อม `param`, `value`, `reason`
- `validate: false` ข้ามเฉพาะการตรวจรูปแบบ ID/enum/ช่วง limit แต่ยังตรวจชนิดพื้นฐานและ encode เสมอ

## 11. Tooling

| เรื่อง          | ค่า                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager | pnpm `12.16.1` (`packageManager` field), `pnpm-lock.yaml`; ลบ `package-lock.json`                                                                                                                                                                                             |
| Node            | `engines.node: ">=22"`; CI matrix 22, 24, 26                                                                                                                                                                                                                                  |
| Module          | `"type": "module"`, ESM-only; `exports`: `"."` และ `"./types"` (types + import) และ `"./package.json"`                                                                                                                                                                        |
| TypeScript      | 6.0.x (TS 7 ใช้ไม่ได้: typescript-eslint 8.72 peer `typescript <6.1.0`) — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedDeclarations`, `erasableSyntaxOnly`, `module/moduleResolution: NodeNext`, `target/lib: ES2023` |
| Build           | tsdown `0.23.x` (pin minor), `format: ["esm"]`, `dts: true`, `exports: true`, `publint: "ci-only"`, `attw: "ci-only"`, `failOnWarn: "ci-only"`                                                                                                                                |
| Lint            | ESLint 9 flat + typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`; lint ไฟล์ test ด้วย                                                                                                                                                                           |
| Format          | Prettier (คง config เดิม)                                                                                                                                                                                                                                                     |
| Test            | Vitest 5                                                                                                                                                                                                                                                                      |
| Scripts         | `build`, `dev`, `lint`, `format`, `typecheck`, `test`, `test:integration`, `check` (รวมทุกอย่าง)                                                                                                                                                                              |
| Runtime deps    | ไม่มี                                                                                                                                                                                                                                                                         |
| Dev deps        | `@line/bot-sdk`, `tsdown`, `typescript`, `vitest`, `eslint`, `typescript-eslint`, `@eslint/js`, `prettier`, `publint`, `@arethetypeswrong/core`, `@changesets/cli`, `@types/node`                                                                                             |

## 12. Testing

- **Unit (`test/unit/`)** — mock ผ่าน option `fetch`:
  - cookies: parse ทั้ง 3 รูปแบบ, error ที่ชี้ตำแหน่งผิด, domain/path/expiry/secure/`__Host-` matching, Set-Cookie upsert/delete
  - http: URL resolve ต่อ service, header merge ลำดับ (default < client < request), timeout, abort, retry (429 + Retry-After, 5xx, ไม่ retry POST), hooks + redaction, absolute URL allowlist
  - errors: status → class mapping, `SESSION_EXPIRED`, brand guard
  - pagination: single page, multi-page iteration, `toArray` limits, `break` กลางทาง, cursor ซ้ำ, list ไม่ใช่ array
  - validate: ทุก assertion + `validate: false`
  - resources: ทุกเมธอดยิง method/URL/query ถูกต้อง (รวม regression: contacts ส่ง `next`)
- **Fixtures (`test/fixtures/`)** — JSON response จริงที่ sanitize แล้ว; type-level test ด้วย `expectTypeOf` ว่า fixture assign เข้ากับ public types ได้
- **Integration (`test/integration/`)** — skip เว้นแต่มี `LINEBIZ_COOKIES` (และ `LINEBIZ_BOT_ID` สำหรับ endpoint ที่ต้องใช้ bot); เป็น read-only (ไม่เรียก `logout`); รันด้วย `pnpm test:integration`; ไม่อยู่ใน CI ปกติ
- ไม่มี credential ใน repo; `.env*` อยู่ใน `.gitignore` แล้ว

## 13. บั๊กที่ต้องแก้ใน refactor นี้

1. `getContactByName` ไม่ส่ง `next` → ดึงหน้าเดิมซ้ำ / ลูปไม่จบเมื่อ `maxPages: 0`
2. Query string ไม่ encode (`nextToken`, `tagIds`, `bizIds`, `userIds`, `messageId`)
3. `getTags` ไม่ validate (ถูก comment ทิ้ง)
4. `NOT_FOUND` error ไม่มี `cause` / `status`
5. `.d.ts` อ้าง `@line/bot-sdk` ที่ผู้ใช้ไม่มี (ยืนยันด้วย attw หลัง build)
6. `logout()` ส่ง cookie ทั้งหมดไปยัง URL ที่ server คืนมาโดยไม่ตรวจ host

## 14. CI/CD และเอกสาร

- **GitHub Actions `ci.yml`** (push/PR): pnpm install (frozen lockfile) → lint → typecheck → test (matrix Node 22/24/26) → build (publint + attw)
- **`release.yml`**: Changesets action สร้าง Version PR; เมื่อ merge → `pnpm publish` ผ่าน npm Trusted Publishing (OIDC) + provenance; Changesets ตั้ง `changelog: false`, release notes เขียนใน GitHub Releases
- **เอกสาร:** `README.md` (อังกฤษ: install, quick start, client options, cookies & CookieStore, pagination, errors, unofficial/ToS disclaimer) และ `README.th.md`; JSDoc ภาษาอังกฤษบนทุก public API; ย้าย `FUNDING.yml` → `.github/FUNDING.yml`

## 14a. License

- คง **ISC**; `package.json` `"license": "ISC"`
- ไฟล์ `LICENSE` ไม่ระบุชื่อบุคคล: บรรทัด copyright เป็น `Copyright (c) 2025-2026 linebiz contributors` (ISC อ้างถึง "the above copyright notice" จึงคงบรรทัดนี้ไว้แบบไม่ระบุชื่อ)
- เพิ่ม `THIRD_PARTY_NOTICES.md` (ใส่ใน `files` ของ package) แนบ Apache-2.0 notice ของ `@line/bot-sdk` สำหรับ type ที่ถูก inline ลง `.d.ts` — ถ้าตรวจแล้ว `.d.ts` ไม่มี type จาก bot-sdk ให้ตัดไฟล์นี้ทิ้ง

## 15. Rollout

| ขั้น | งาน                                                                                                                                                                                                                                                                                   | ใครทำ                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0    | Revoke session ที่หลุดใน `src/test.test.ts`; ล้าง history ด้วย `git filter-repo` + force-push                                                                                                                                                                                         | **ต้องอนุมัติแยก** — เตรียมคำสั่งให้ ไม่รันเอง |
| 1    | Implement refactor บน branch `refactor/linebiz` ตาม implementation plan แล้ว merge                                                                                                                                                                                                    | Claude                                         |
| 2    | Rename GitHub repo → `linebiz`; ตั้ง npm Trusted Publisher; publish `@prakrit_m/linebiz@0.1.0`                                                                                                                                                                                        | ผู้ใช้อนุมัติ/ทำ                               |
| 3    | `npm deprecate @prakrit_m/lineweb "Moved to @prakrit_m/linebiz"`                                                                                                                                                                                                                      | ผู้ใช้อนุมัติ/ทำ                               |
| 4    | **Live verification & API capture:** ใช้ browser ล็อกอิน `chat.line.biz` / `manager.line.biz` (ผู้ใช้ล็อกอินเอง), ดักจับ network request, ตรวจว่า endpoint/รูปร่าง response ตรงกับ types, เพิ่ม/แก้ fixtures, รัน integration tests, ระบุ endpoint ใหม่ (เช่น manager) สำหรับรอบถัดไป | หลัง refactor เสร็จ — แยก task                 |

## 16. สิ่งที่ต้องยืนยันตอนเขียน implementation plan

**ผลการยืนยัน (2026-11-01):** (1) tsdown 0.23.4 peer `typescript ^5||^6||^7` แต่ typescript-eslint 8.72.1 peer `<6.1.0` → ใช้ TypeScript 6.0.3 (5) pnpm 12 รองรับ trusted publishing + provenance ใน `pnpm publish`; `pnpm/action-setup@v6` อ่าน `packageManager` (2) ยืนยันด้วย build ใน Task 1 ของ plan (3)(4) ใช้ข้อมูลเดิม (6) ผู้ใช้ตั้งค่าบน npmjs.com ตอน rollout

1. tsdown 0.23.x ทำงานกับ TypeScript 7.x (ถ้าไม่ได้ → ใช้ TS ล่าสุดที่รองรับ เช่น 5.9/6.x)
2. tsdown inline type จาก devDependency `@line/bot-sdk` ลง `.d.ts` ได้จริงเมื่อเปิด `isolatedDeclarations` (ถ้าไม่ได้ → ตั้ง `deps.dts.alwaysBundle` หรือเขียน type เองเท่าที่ใช้)
3. `require(esm)` ใช้ได้โดยไม่ต้องใช้ flag บน Node ≥22.12 (ไว้ใช้เขียน README เท่านั้น)
4. `Headers.prototype.getSetCookie()` มีใน Node ≥22
5. pnpm 12 รองรับ `packageManager` field + `pnpm/action-setup` ใน CI
6. ขั้นตอนตั้ง npm Trusted Publishing สำหรับ scoped package
