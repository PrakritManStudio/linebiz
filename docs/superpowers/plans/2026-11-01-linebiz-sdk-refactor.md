# LineBiz SDK Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เขียน `@prakrit_m/lineweb` ใหม่เป็น `@prakrit_m/linebiz@0.1.0` — resource-based, ESM-only, zero runtime deps, native fetch, domain-aware cookie store, มี test/CI/release ครบ

**Architecture:** `LineBizClient` ประกอบ resource objects (`client.chats.list(...)`) ที่สร้าง `RequestDescriptor` แล้วส่งให้ `HttpClient` (core/http.ts) ซึ่งจัดการ URL ต่อ service, header, cookie (`CookieStore`), timeout/abort/retry, hooks และแปลง error; endpoint แบบแบ่งหน้าคืน `PagePromise<T>` จาก core/pagination.ts

**Tech Stack:** TypeScript 6.0.3, Node ≥22, pnpm 12.16.1, tsdown 0.23.x, Vitest 5, ESLint 10 + typescript-eslint 8, Prettier 3, Changesets 3, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-11-01-linebiz-sdk-refactor-design.md` (อ่านคู่กับ plan นี้ — ตัวเลข/ชื่อทั้งหมดอ้างจาก spec)

## Global Constraints

- Branch: `refactor/linebiz`; commit message แบบ conventional (`feat:`, `chore:`, `test:` …) และลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `engines.node: ">=22"`, `"type": "module"`, ESM-only, **ไม่มี runtime `dependencies`**
- `packageManager: "pnpm@12.16.1"`; ใช้ `pnpm` ทุกคำสั่ง ห้าม `npm install`
- TypeScript `~6.0.3`; `@types/node` `^22` (ห้ามใช้ API ที่ใหม่กว่า Node 22)
- `isolatedDeclarations: true` → ทุก export (function, class member, const) ต้องมี type annotation / return type ชัดเจน
- Relative import ใช้นามสกุล `.js` (NodeNext)
- ชื่อ public ตาม spec §3: `LineBizClient`, `LineBizError`, `LineBizErrorCode`, `isLineBizError`, subpath `./types`
- Public method ทุกตัว **reject** promise เมื่อผิดพลาด ห้าม throw แบบ sync
- ห้ามมีค่า cookie ใน error message, error fields, หรือ hook context (header `cookie`/`set-cookie` → `"[REDACTED]"`)
- JSDoc ภาษาอังกฤษบนทุก public export
- License ISC, `Copyright (c) 2025-2026 linebiz contributors`
- ห้ามมี credential ใด ๆ ใน repo; integration test อ่าน `LINEBIZ_COOKIES` / `LINEBIZ_BOT_ID` จาก env เท่านั้น
- ห้าม push, publish, rename repo, `npm deprecate`, หรือแก้ git history — เป็นงานของผู้ใช้ (spec §15)

## Review Focus

1. **Server ตอบ 3xx (เช่น redirect ไปหน้า login เมื่อ session หมด)** → ไม่ follow redirect, cookie ไม่ถูกส่งไป host ใน `Location`, ได้ `UnexpectedResponseError` ที่มี `status` และ `location` — test อยู่ Task 6
2. **Response 401/5xx ที่มี `Set-Cookie`** → store ยังอัปเดต/ลบ cookie ตาม header ก่อน reject — test อยู่ Task 6
3. **Body 200 ที่ไม่ใช่ JSON (หน้า HTML maintenance) หรือว่าง** → `UnexpectedResponseError` (ไม่ใช่ `SyntaxError`); body ว่างคืน `undefined` — test อยู่ Task 6
4. **ผู้ใช้ abort ระหว่างรอ backoff ก่อน retry** → reject `AbortError` ทันที ไม่ยิง request เพิ่ม — test อยู่ Task 7
5. **Cookie JSON จาก Cookie-Editor** (`expirationDate` แทน `expires`, `hostOnly`, `sameSite: "no_restriction"|"lax"|"unspecified"`, field เกิน เช่น `storeId`, `session`) → parse ได้ถูกต้อง; cookie ที่หมดอายุแล้วถูกตัดทิ้ง — test อยู่ Task 4

---

## File Map

| Path | หน้าที่ | Task |
|---|---|---|
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `eslint.config.js` | toolchain | 1 |
| `src/types/{me,bots,owners,tags,chats,messages,contacts,members,index}.ts` | public response types (ย้ายจาก `src/type/`) | 1 |
| `test/fixtures/*.ts` | typed sample responses | 1 |
| `src/core/errors.ts`, `src/core/retry.ts` | error hierarchy, Retry-After/backoff | 2 |
| `src/core/validate.ts` | `Validator` | 3 |
| `src/core/cookies.ts` | cookie input parser, `CookieStore`, `MemoryCookieStore` | 4, 5 |
| `src/core/services.ts`, `src/core/http.ts`, `test/helpers/mock-fetch.ts` | HTTP pipeline | 6, 7 |
| `src/core/pagination.ts` | `Page`, `PagePromise`, `paginate`, `readListResponse` | 8 |
| `src/client.ts`, `src/resources/*.ts`, `src/index.ts` | public client | 9, 10 |
| `README.md`, `README.th.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `.github/FUNDING.yml`, `test/integration/*` | docs + integration | 11 |
| `.github/workflows/{ci,release}.yml`, `.changeset/config.json` | CI/CD | 12 |

ลบ: `src/client.ts` (เดิม), `src/errors.ts`, `src/test.test.ts`, `src/type/`, `tsup.config.ts`, `package-lock.json`, `FUNDING.yml` (root)

---

### Task 1: Toolchain migration + public types

**Files:**
- Modify: `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierignore`
- Create: `tsdown.config.ts`, `vitest.config.ts`, `pnpm-lock.yaml`, `src/index.ts` (เขียนใหม่), `test/fixtures/{me,bots,owners,tags,chats,messages,contacts,members,flex}.ts`
- Move: `src/type/*.ts` → `src/types/*.ts` (`git mv`)
- Delete: `src/client.ts`, `src/errors.ts`, `src/test.test.ts`, `tsup.config.ts`, `package-lock.json`

**Interfaces:**
- Produces (exported จาก `src/types/index.ts` และ root):
  - `Me`
  - `Bot` (เดิม `BotData`), `BotDetail` (เดิม `Bot`, `extends Bot { hasChatRoom: boolean }`)
  - `Owner` (เดิม `OwnersList`), `Tag` (เดิม `TagsData`)
  - `Chat`, `ChatProfile`, `ChatEvent`, `MessageSource`
  - `MessageEvent` (เดิม `MessageEventType`) + สมาชิก union: `ChatReadEvent`, `MessageReceivedEvent` (เดิม `Message`), `MessageSentEvent`, `UnsendEvent`, `JoinEvent`, `LeaveEvent`, `MemberLeftEvent`, `MemberJoinedEvent`
  - `Contact`, `ContactUserProfile`, `ContactGroupProfile`
  - `Member`
  - `export type { FlexContainer } from "@line/bot-sdk"`
- ลบ `*Response` types ทั้งหมด (`BotsList`, `OwnersResponse`, `TagsResponse`, `ChatsResponse`, `MessagesResponse`, `ContactResponse`, `MemberListResponse`)
- Fixtures (ใช้ใน Task 9–10) แต่ละไฟล์ export const ที่มี type annotation ชัดเจน:
  - `meFixture: Me`, `botsPageFixture: { list: Bot[]; next?: string }`, `botDetailFixture: BotDetail`, `ownersFixture: { list: Owner[] }`, `tagsFixture: { list: Tag[] }`, `chatsPageFixture: { list: Chat[]; next?: string }`, `contactsPageFixture: { list: Contact[]; next?: string }`, `membersPageFixture: { list: Member[]; next?: string }`, `flexFixture: FlexContainer`
  - `messagesPageFixture: { list: MessageEvent[]; backward?: string }` ต้องมีอย่างน้อยหนึ่ง event ต่อ variant ของ union (ทั้ง 8 แบบ)
  - ID ใน fixture: `"U" + "0".repeat(32)` (33 ตัว), chat `"C" + "1".repeat(32)`, bizId เป็น UUID ปลอม; ห้ามใช้ข้อมูลจริง

- [ ] **Step 1: เขียน fixtures** ใน `test/fixtures/` ตาม Interfaces ด้านบน โดย import type จาก `../../src/types/index.js`

- [ ] **Step 2: ติดตั้ง toolchain**

`package.json` (field ที่เปลี่ยน — ที่เหลือคงไว้):
```json
{
  "name": "@prakrit_m/linebiz",
  "version": "0.1.0",
  "description": "Unofficial TypeScript client for LINE OA web APIs (chat.line.biz)",
  "type": "module",
  "packageManager": "pnpm@12.16.1",
  "engines": { "node": ">=22" },
  "files": ["dist", "THIRD_PARTY_NOTICES.md"],
  "sideEffects": false,
  "license": "ISC",
  "repository": { "type": "git", "url": "git+https://github.com/PrakritManStudio/linebiz.git" },
  "bugs": { "url": "https://github.com/PrakritManStudio/linebiz/issues" },
  "homepage": "https://github.com/PrakritManStudio/linebiz#readme",
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "lint": "eslint .",
    "format": "prettier -w .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build",
    "prepublishOnly": "pnpm check"
  }
}
```
ลบ `main`/`module`/`types`/`exports` (tsdown สร้าง `exports` ให้), ลบ `dependencies`, ลบ `prepare`; keywords: `line`, `line oa`, `line official account`, `chat.line.biz`, `sdk`, `typescript`, `unofficial`

Run:
```bash
rm package-lock.json tsup.config.ts src/test.test.ts src/client.ts src/errors.ts
pnpm add -D @line/bot-sdk@^11.4.0 tsdown@~0.23.4 typescript@~6.0.3 vitest@^5.0.5 eslint@^10 @eslint/js@^10 typescript-eslint@^8.72.1 prettier@^3.9.10 publint@^0.3.25 @arethetypeswrong/core@^0.18.5 @types/node@^22
pnpm remove axios @typescript-eslint/eslint-plugin @typescript-eslint/parser tsup
```
ถ้า pnpm แจ้ง build script ถูกบล็อก → `pnpm approve-builds` อนุมัติเฉพาะที่ toolchain ต้องใช้ (เช่น `esbuild`) แล้ว commit `pnpm-workspace.yaml` ที่เกิดขึ้น

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023", "lib": ["ES2023"],
    "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true, "isolatedDeclarations": true, "declaration": true,
    "erasableSyntaxOnly": true, "noEmit": true, "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`tsdown.config.ts`: `entry: ["src/index.ts", "src/types/index.ts"]`, `format: ["esm"]`, `platform: "node"`, `target: "node22"`, `dts: true`, `sourcemap: true`, `clean: true`, `exports: true`, `publint: "ci-only"`, `attw: "ci-only"`, `failOnWarn: "ci-only"`

`vitest.config.ts`: `test.projects` = `{ name: "unit", include: ["test/unit/**/*.test.ts"] }` และ `{ name: "integration", include: ["test/integration/**/*.test.ts"] }`

`eslint.config.js`: `defineConfig` จาก `eslint/config`; `ignores: ["dist", "coverage"]`; `js.configs.recommended`; `tseslint.configs.strictTypeChecked` + `tseslint.configs.stylisticTypeChecked`; `parserOptions.projectService: { allowDefaultProject: ["*.config.ts", "eslint.config.js"] }`, `tsconfigRootDir: import.meta.dirname`; lint ไฟล์ test ด้วย (ลบ ignore `**/*.test.ts` เดิม)

`.prettierignore`: เพิ่ม `pnpm-lock.yaml`, `dist`

- [ ] **Step 3: Run typecheck เพื่อให้เห็นว่า fail**

Run: `pnpm typecheck`
Expected: FAIL — `Cannot find module '../../src/types/index.js'`

- [ ] **Step 4: ย้ายและเปลี่ยนชื่อ types**

`git mv src/type src/types`; เปลี่ยนชื่อตาม Interfaces; export สมาชิก union ทุกตัวใน `messages.ts`; `src/types/index.ts` re-export ทุกไฟล์ด้วย `export type * from "./x.js"` + `export type { FlexContainer } from "@line/bot-sdk"`; `src/index.ts` ตอนนี้มีแค่ `export type * from "./types/index.js";`

- [ ] **Step 5: ตรวจ toolchain ทั้งชุด**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: ทั้งหมดผ่าน; `dist/index.js`, `dist/index.d.ts`, `dist/types/index.d.ts` มีอยู่

- [ ] **Step 6: ตรวจว่า type ของ bot-sdk ถูก inline**

Run: `grep -r "@line/bot-sdk" dist/ ; node -e "console.log(JSON.stringify(require('./package.json').exports,null,1))"`
Expected: grep ไม่เจออะไร; `exports` มี `"."`, `"./types"`, `"./package.json"`
ถ้า grep เจอ: เพิ่ม `deps: { dts: { alwaysBundle: ["@line/bot-sdk"] } }` ใน `tsdown.config.ts` แล้ว build ใหม่ ถ้ายังเจออยู่ ให้ลบ re-export `FlexContainer` และเขียน type `FlexContainer` (bubble/carousel) ขั้นต่ำเองใน `src/types/flex.ts`, จากนั้นข้าม `THIRD_PARTY_NOTICES.md` ใน Task 11
ถ้า `exports` ไม่มี `"./package.json"`: ตั้ง `exports: { packageJson: true }`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore!: migrate to pnpm, tsdown, TS 6 and move public types to src/types"
```

---

### Task 2: Error hierarchy + retry helpers

**Files:**
- Create: `src/core/errors.ts`, `src/core/retry.ts`
- Test: `test/unit/errors.test.ts`, `test/unit/retry.test.ts`

**Interfaces:**
- Produces (`src/core/retry.ts`):
  - `parseRetryAfter(value: string | null, now?: number): number | undefined` — ms; รับวินาทีหรือ HTTP-date; cap `60_000`; ค่าที่ parse ไม่ได้ → `undefined`
  - `backoffDelay(attempt: number, random?: () => number): number` — `min(500 * 2 ** attempt, 8000) * (0.75 + random() * 0.5)` (attempt เริ่ม 0)
  - `isRetryableStatus(status: number): boolean` — `408`, `429`, `>= 500`
- Produces (`src/core/errors.ts`):
  - `LineBizErrorCode` (const object + type) ค่าตาม spec §9: `INVALID_OPTIONS, INVALID_COOKIE, INVALID_PARAMETER, CONNECTION_ERROR, TIMEOUT, ABORTED, UNEXPECTED_RESPONSE, SESSION_EXPIRED, UNAUTHORIZED, PERMISSION_DENIED, NOT_FOUND, RATE_LIMITED, SERVER_ERROR, API_ERROR`
  - `class LineBizError extends Error { readonly code: LineBizErrorCode; constructor(code: LineBizErrorCode, message: string, options?: { cause?: unknown }) }` — `name` ของแต่ละ class = ชื่อ class
  - `class ConfigError extends LineBizError` — `constructor(message: string, options?: { code?: "INVALID_OPTIONS" | "INVALID_COOKIE"; cause?: unknown })`, default `INVALID_OPTIONS`
  - `class ValidationError extends LineBizError` — `constructor(init: { param: string; value: unknown; reason: string })`; fields `param`, `value`, `reason`; message `Invalid parameter "<param>": <reason>`
  - `class ConnectionError extends LineBizError` — `constructor(message: string, options?: { cause?: unknown })`
  - `class TimeoutError extends ConnectionError` (code `TIMEOUT`)
  - `class AbortError extends LineBizError` (code `ABORTED`)
  - `class UnexpectedResponseError extends LineBizError` — `constructor(message: string, options?: { status?: number; body?: unknown; location?: string; cause?: unknown })`
  - `interface APIErrorInit { status: number; body: unknown; headers: Record<string, string>; method: string; url: string }`
  - `class APIError extends LineBizError` — fields จาก `APIErrorInit` (headers ผ่าน `redactHeaders`); `static from(init: APIErrorInit): APIError` เลือก subclass ตาม status
  - `AuthenticationError` (401; code `SESSION_EXPIRED` เมื่อ `body.code === "not_login"` มิฉะนั้น `UNAUTHORIZED`), `PermissionDeniedError` (403), `NotFoundError` (404), `RateLimitError` (429; `readonly retryAfter: number | undefined` จาก header `retry-after`), `InternalServerError` (≥500); status อื่น → `APIError` code `API_ERROR`
  - `isLineBizError(value: unknown): value is LineBizError` — ตรวจ brand `Symbol.for("linebiz.error")` บน prototype
  - `redactHeaders(headers: Record<string, string>): Record<string, string>` — key `cookie`/`set-cookie` (case-insensitive) → `"[REDACTED]"`
  - `truncateBody(text: string): string` — ตัดที่ 2,000 ตัวอักษร

- [ ] **Step 1: เขียน failing tests**

```ts
// test/unit/retry.test.ts
it("parses seconds", () => expect(parseRetryAfter("3")).toBe(3000));
it("parses HTTP date", () => expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000));
it("caps at 60s", () => expect(parseRetryAfter("600")).toBe(60_000));
it("returns undefined for garbage/null", () => { expect(parseRetryAfter("soon")).toBeUndefined(); expect(parseRetryAfter(null)).toBeUndefined(); });
it("backoff grows and caps", () => { expect(backoffDelay(0, () => 0.5)).toBe(500); expect(backoffDelay(10, () => 0.5)).toBe(8000); expect(backoffDelay(0, () => 0)).toBe(375); expect(backoffDelay(0, () => 1)).toBe(625); });
it("retryable statuses", () => { for (const s of [408, 429, 500, 503]) expect(isRetryableStatus(s)).toBe(true); for (const s of [400, 401, 403, 404]) expect(isRetryableStatus(s)).toBe(false); });

// test/unit/errors.test.ts
const base = { headers: { "set-cookie": "a=1", "x-id": "1" }, method: "GET", url: "https://chat.line.biz/api/v1/me" };
it("401 not_login → SESSION_EXPIRED", () => { const e = APIError.from({ ...base, status: 401, body: { code: "not_login" } }); expect(e).toBeInstanceOf(AuthenticationError); expect(e.code).toBe("SESSION_EXPIRED"); });
it("401 other → UNAUTHORIZED", () => expect(APIError.from({ ...base, status: 401, body: {} }).code).toBe("UNAUTHORIZED"));
it.each([[403, PermissionDeniedError], [404, NotFoundError], [429, RateLimitError], [502, InternalServerError]])("%i maps to class", (status, cls) => expect(APIError.from({ ...base, status, body: null })).toBeInstanceOf(cls));
it("418 → plain APIError API_ERROR", () => { const e = APIError.from({ ...base, status: 418, body: null }); expect(e.constructor).toBe(APIError); expect(e.code).toBe("API_ERROR"); });
it("RateLimitError reads retry-after", () => expect((APIError.from({ ...base, headers: { "retry-after": "2" }, status: 429, body: null }) as RateLimitError).retryAfter).toBe(2000));
it("redacts set-cookie in APIError.headers", () => expect(APIError.from({ ...base, status: 500, body: null }).headers["set-cookie"]).toBe("[REDACTED]"));
it("keeps cause", () => { const cause = new Error("x"); expect(new ConnectionError("down", { cause }).cause).toBe(cause); });
it("ValidationError fields + message", () => { const e = new ValidationError({ param: "limit", value: 0, reason: "must be between 1 and 25" }); expect(e.message).toBe('Invalid parameter "limit": must be between 1 and 25'); expect(e.code).toBe("INVALID_PARAMETER"); });
it("isLineBizError true for subclasses, false for plain errors and look-alikes", () => { expect(isLineBizError(new TimeoutError("t"))).toBe(true); expect(isLineBizError(new Error("x"))).toBe(false); expect(isLineBizError({ name: "LineBizError" })).toBe(false); });
it("TimeoutError is a ConnectionError", () => expect(new TimeoutError("t")).toBeInstanceOf(ConnectionError));
it("truncateBody", () => expect(truncateBody("x".repeat(3000))).toHaveLength(2000));
```

- [ ] **Step 2: Run** `pnpm test -- errors retry` → Expected: FAIL (module not found)
- [ ] **Step 3: Implement** ตาม Interfaces (ใช้ `super(message, { cause })`; brand ติดที่ `LineBizError.prototype`)
- [ ] **Step 4: Run** `pnpm test -- errors retry && pnpm typecheck && pnpm lint` → Expected: PASS
- [ ] **Step 5: Commit** `git add src/core/errors.ts src/core/retry.ts test/unit/errors.test.ts test/unit/retry.test.ts && git commit -m "feat: add error hierarchy and retry helpers"`

---

### Task 3: Validator

**Files:**
- Create: `src/core/validate.ts`
- Test: `test/unit/validate.test.ts`

**Interfaces:**
- Consumes: `ValidationError` (Task 2)
- Produces: `class Validator { constructor(strict: boolean) }` — ทุก method คืนค่าที่ผ่านการตรวจ (ไม่ใช้ `asserts`):
  - `id(param: string, value: unknown): string` — strict: `/^[A-Za-z0-9]{33}$/`
  - `idList(param: string, value: unknown): string[]` — strict: แต่ละตัว `/^[A-Za-z0-9]+$/`
  - `uuidList(param: string, value: unknown): string[]` — strict: แต่ละตัว `/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/`
  - `digits(param: string, value: unknown): string` — strict: `/^[0-9]+$/`
  - `int(param: string, value: unknown, range: { min: number; max: number }): number`
  - `oneOf<const T extends string>(param: string, value: unknown, allowed: readonly T[]): T`
  - `optionalString(param: string, value: unknown): string | undefined` — สำหรับ cursor/query: ต้องเป็น string ไม่ว่าง ถ้าไม่ใช่ `undefined`
- กฎ non-strict (`strict = false`): ยังตรวจชนิด (string / array of string / integer / string ไม่ว่าง) แต่ข้าม regex, ช่วง min/max และ `allowed`

- [ ] **Step 1: เขียน failing tests**

```ts
const v = new Validator(true), loose = new Validator(false);
const ID = "U" + "a".repeat(32);
it("id ok", () => expect(v.id("botId", ID)).toBe(ID));
it.each([["", "empty"], ["U123", "short"], ["U" + "-".repeat(32), "chars"], [123, "type"]])("id rejects %s (%s)", (bad) => expect(() => v.id("botId", bad)).toThrow(ValidationError));
it("error carries param", () => { try { v.id("chatId", "x"); } catch (e) { expect((e as ValidationError).param).toBe("chatId"); } });
it("int range", () => { expect(v.int("limit", 25, { min: 1, max: 25 })).toBe(25); expect(() => v.int("limit", 26, { min: 1, max: 25 })).toThrow(/between 1 and 25/); expect(() => v.int("limit", 1.5, { min: 1, max: 25 })).toThrow(ValidationError); });
it("uuidList", () => { expect(v.uuidList("bizIds", ["123e4567-e89b-12d3-a456-426614174000"])).toHaveLength(1); expect(() => v.uuidList("bizIds", ["nope"])).toThrow(); expect(() => v.uuidList("bizIds", "x")).toThrow(); });
it("digits", () => { expect(v.digits("messageId", "123")).toBe("123"); expect(() => v.digits("messageId", "12a")).toThrow(); });
it("oneOf", () => { expect(v.oneOf("order", "ASC", ["ASC", "DESC"] as const)).toBe("ASC"); expect(() => v.oneOf("order", "asc", ["ASC", "DESC"] as const)).toThrow(); });
it("optionalString", () => { expect(v.optionalString("cursor", undefined)).toBeUndefined(); expect(() => v.optionalString("cursor", "  ")).toThrow(); });
it("non-strict skips format but keeps type checks", () => { expect(loose.id("botId", "short")).toBe("short"); expect(loose.int("limit", 5000, { min: 1, max: 25 })).toBe(5000); expect(loose.oneOf("order", "asc", ["ASC"] as const)).toBe("asc"); expect(() => loose.id("botId", 1)).toThrow(ValidationError); expect(() => loose.int("limit", "1", { min: 1, max: 2 })).toThrow(); });
```

- [ ] **Step 2: Run** `pnpm test -- validate` → FAIL
- [ ] **Step 3: Implement** `src/core/validate.ts`
- [ ] **Step 4: Run** `pnpm test -- validate && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add parameter validator"` (add ทั้งสองไฟล์)

---

### Task 4: Cookie input parsing

**Files:**
- Create: `src/core/cookies.ts` (ส่วน parse)
- Test: `test/unit/cookies-parse.test.ts`

**Interfaces:**
- Consumes: `ConfigError` (Task 2)
- Produces:
  - `interface CookieObject { name: string; value: string; domain?: string; path?: string; expires?: number; secure?: boolean; httpOnly?: boolean; sameSite?: "Strict" | "Lax" | "None" }` — `expires` = วินาที epoch, `-1`/ไม่มี = session cookie
  - `type CookieInput = string | CookieObject[]`
  - `interface CookieStore { getCookieHeader(url: URL): string | Promise<string>; setCookies?(url: URL, setCookie: string[]): void | Promise<void> }`
  - `parseCookieInput(input: unknown, now?: number): CookieObject[]` — กติกา:
    - string ขึ้นต้นด้วย `[` (หลัง trim) → `JSON.parse`; parse fail → `ConfigError` code `INVALID_COOKIE` ข้อความ `Invalid cookies JSON: <reason>`
    - string อื่น → header string: split `;`, trim, ข้ามช่องว่าง, แยกที่ `=` ตัวแรก; ไม่มี `=` → `ConfigError` `Invalid cookie pair at position <i>`; ได้ `domain: ".line.biz"`, `path: "/"`
    - array: แต่ละ element ต้องเป็น object ที่ `name`/`value` เป็น string มิฉะนั้น `ConfigError` `cookies[<i>].<field> must be a string`
    - alias แบบ Cookie-Editor: `expirationDate` → `expires`; `hostOnly: true` → domain ไม่มีจุดนำหน้า; `hostOnly: false` → domain มีจุดนำหน้า; `sameSite` เทียบแบบ case-insensitive: `strict`→`Strict`, `lax`→`Lax`, `none`/`no_restriction`→`None`, `unspecified`/อื่น ๆ → ไม่ใส่; ไม่สนใจ field อื่น
    - ไม่มี `domain` → `.line.biz`; ไม่มี `path` → `/`
    - กรองเหลือเฉพาะ domain (ตัดจุดนำหน้าแล้ว) ที่เท่ากับ `line.biz` หรือลงท้าย `.line.biz`
    - ตัดทิ้ง cookie ที่ `expires > 0 && expires * 1000 <= now`
    - เหลือ 0 ตัว → `ConfigError` `No cookies for *.line.biz found`
    - input ที่ไม่ใช่ string/array → `ConfigError` `cookies must be a string or an array`

- [ ] **Step 1: เขียน failing tests**

```ts
const NOW = 1_800_000_000_000;
it("header string", () => expect(parseCookieInput("a=1; b=x=y", NOW)).toEqual([{ name: "a", value: "1", domain: ".line.biz", path: "/" }, { name: "b", value: "x=y", domain: ".line.biz", path: "/" }]));
it("rejects pair without =", () => expect(() => parseCookieInput("a=1; junk", NOW)).toThrow(/position 1/));
it("playwright array filters non line.biz", () => expect(parseCookieInput([{ name: "s", value: "1", domain: "chat.line.biz" }, { name: "g", value: "2", domain: "www.google.com" }], NOW).map((c) => c.name)).toEqual(["s"]));
it("JSON string (legacy format)", () => expect(parseCookieInput(JSON.stringify([{ name: "ses", value: "v", domain: ".line.biz", expires: -1 }]), NOW)).toHaveLength(1));
it("bad JSON", () => expect(() => parseCookieInput("[{", NOW)).toThrow(/Invalid cookies JSON/));
it("points at bad element", () => expect(() => parseCookieInput([{ name: "a", value: 1 }], NOW)).toThrow("cookies[0].value must be a string"));
it("Cookie-Editor export", () => {
  const out = parseCookieInput([{ domain: "chat.line.biz", expirationDate: 1_900_000_000, hostOnly: true, httpOnly: true, name: "__Host-chat-ses", path: "/", sameSite: "lax", secure: true, session: false, storeId: "0", value: "v" }, { domain: ".line.biz", hostOnly: false, name: "ses", sameSite: "no_restriction", value: "w", session: true }], NOW);
  expect(out[0]).toEqual({ name: "__Host-chat-ses", value: "v", domain: "chat.line.biz", path: "/", expires: 1_900_000_000, secure: true, httpOnly: true, sameSite: "Lax" });
  expect(out[1]?.sameSite).toBe("None"); expect(out[1]?.domain).toBe(".line.biz");
});
it("drops expired cookies", () => expect(parseCookieInput([{ name: "old", value: "1", domain: ".line.biz", expires: 1 }, { name: "ok", value: "2", domain: ".line.biz" }], NOW).map((c) => c.name)).toEqual(["ok"]));
it("throws when nothing left", () => expect(() => parseCookieInput([{ name: "g", value: "1", domain: "google.com" }], NOW)).toThrow(/No cookies/));
it("rejects other types", () => expect(() => parseCookieInput(42, NOW)).toThrow(ConfigError));
it("error never contains cookie value", () => { try { parseCookieInput("secretvalue123", NOW); } catch (e) { expect(String((e as Error).message)).not.toContain("secretvalue123"); } });
```

- [ ] **Step 2: Run** `pnpm test -- cookies-parse` → FAIL
- [ ] **Step 3: Implement** `parseCookieInput` + types ใน `src/core/cookies.ts`
- [ ] **Step 4: Run** `pnpm test -- cookies-parse && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: parse cookie inputs in header, array and JSON formats"`

---

### Task 5: MemoryCookieStore

**Files:**
- Modify: `src/core/cookies.ts`
- Test: `test/unit/cookie-store.test.ts`

**Interfaces:**
- Consumes: `parseCookieInput`, `CookieObject`, `CookieInput`, `CookieStore` (Task 4)
- Produces: `class MemoryCookieStore implements CookieStore`
  - `constructor(input?: CookieInput, options?: { now?: () => number })`
  - `getCookieHeader(url: URL): string` — `name=value` คั่นด้วย `"; "` เรียง path ยาวก่อน (path ยาวเท่ากัน → ลำดับที่ถูกเพิ่มเข้า store); ตัด cookie หมดอายุ
  - `setCookies(url: URL, setCookie: string[]): void`
  - `toJSON(): CookieObject[]` — domain cookie มีจุดนำหน้า, host-only ไม่มี; `expires` เป็นวินาทีหรือ `-1`
- กติกา matching (RFC 6265 subset):
  - domain ที่มีจุดนำหน้า = domain cookie → match host ที่เท่ากับ domain หรือลงท้าย `.domain`; ไม่มีจุด = host-only → match host ตรงตัว
  - path match: `/` match ทุกอย่าง; `/a` match `/a`, `/a/…` แต่ไม่ match `/ab`
  - `secure` → ส่งเฉพาะ `https:`
  - key ของ cookie = `name + domain + path` (upsert ทับตัวเดิม)
- Set-Cookie parsing: `name=value` แล้วตามด้วย attribute `Domain`, `Path`, `Expires`, `Max-Age` (ชนะ `Expires`), `Secure`, `HttpOnly`, `SameSite` (case-insensitive)
  - ไม่มี `Domain` → host-only ที่ `url.hostname`; มี `Domain` แต่ host ปัจจุบันไม่ domain-match → ไม่รับ
  - ไม่มี `Path` → default-path ตาม RFC (directory ของ `url.pathname`, ถ้าไม่ขึ้นต้น `/` หรือไม่มี `/` ตัวที่สอง → `/`)
  - `Max-Age <= 0` หรือ `Expires` ในอดีต → ลบ cookie ที่ key ตรงกัน
  - prefix `__Host-` ต้องมี `Secure`, ไม่มี `Domain`, `Path=/` ไม่งั้นไม่รับ; prefix `__Secure-` ต้องมี `Secure`

- [ ] **Step 1: เขียน failing tests**

```ts
let t = 1_800_000_000_000; const now = () => t;
const chat = new URL("https://chat.line.biz/api/v1/me"), mgr = new URL("https://manager.line.biz/x"), acc = new URL("https://account.line.biz/");
it("domain vs host-only", () => {
  const s = new MemoryCookieStore([{ name: "ses", value: "1", domain: ".line.biz" }, { name: "__Host-chat-ses", value: "2", domain: "chat.line.biz", secure: true, path: "/" }], { now });
  expect(s.getCookieHeader(chat)).toBe("ses=1; __Host-chat-ses=2");
  expect(s.getCookieHeader(mgr)).toBe("ses=1");
});
it("secure only over https", () => { const s = new MemoryCookieStore([{ name: "a", value: "1", domain: ".line.biz", secure: true }], { now }); expect(s.getCookieHeader(new URL("http://chat.line.biz/"))).toBe(""); });
it("path matching and ordering", () => { const s = new MemoryCookieStore([{ name: "r", value: "1", domain: ".line.biz", path: "/" }, { name: "p", value: "2", domain: ".line.biz", path: "/api" }], { now }); expect(s.getCookieHeader(chat)).toBe("p=2; r=1"); expect(s.getCookieHeader(new URL("https://chat.line.biz/apix"))).toBe("r=1"); });
it("Set-Cookie upsert host-only with default path", () => { const s = new MemoryCookieStore(undefined, { now }); s.setCookies(new URL("https://chat.line.biz/api/v1/me"), ["XSRF-TOKEN=abc; Secure; HttpOnly"]); expect(s.toJSON()).toEqual([expect.objectContaining({ name: "XSRF-TOKEN", value: "abc", domain: "chat.line.biz", path: "/api/v1", expires: -1 })]); });
it("Set-Cookie replaces existing", () => { const s = new MemoryCookieStore([{ name: "ses", value: "old", domain: ".line.biz", path: "/" }], { now }); s.setCookies(chat, ["ses=new; Domain=line.biz; Path=/"]); expect(s.getCookieHeader(acc)).toBe("ses=new"); });
it("Max-Age=0 deletes", () => { const s = new MemoryCookieStore([{ name: "ses", value: "1", domain: ".line.biz", path: "/" }], { now }); s.setCookies(chat, ["ses=; Domain=.line.biz; Path=/; Max-Age=0"]); expect(s.getCookieHeader(chat)).toBe(""); });
it("expires over time", () => { const s = new MemoryCookieStore(undefined, { now }); s.setCookies(chat, ["a=1; Path=/; Max-Age=10"]); expect(s.getCookieHeader(chat)).toBe("a=1"); t += 11_000; expect(s.getCookieHeader(chat)).toBe(""); });
it("rejects foreign Domain", () => { const s = new MemoryCookieStore(undefined, { now }); s.setCookies(chat, ["x=1; Domain=evil.com"]); expect(s.toJSON()).toEqual([]); });
it("__Host- rules", () => { const s = new MemoryCookieStore(undefined, { now }); s.setCookies(chat, ["__Host-a=1; Path=/", "__Host-b=1; Secure; Path=/; Domain=line.biz", "__Host-c=1; Secure; Path=/"]); expect(s.toJSON().map((c) => c.name)).toEqual(["__Host-c"]); });
it("toJSON round-trips into a new store", () => { const s = new MemoryCookieStore("a=1", { now }); expect(new MemoryCookieStore(s.toJSON(), { now }).getCookieHeader(chat)).toBe("a=1"); });
```

- [ ] **Step 2: Run** `pnpm test -- cookie-store` → FAIL
- [ ] **Step 3: Implement** `MemoryCookieStore` (เก็บใน `Map<string, StoredCookie>` ภายใน, `expiresAt` เป็น ms)
- [ ] **Step 4: Run** `pnpm test -- cookie && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add domain-aware MemoryCookieStore"`

---

### Task 6: HTTP pipeline (request/response, errors, cookies, hooks, redirects)

**Files:**
- Create: `src/core/services.ts`, `src/core/http.ts`, `test/helpers/mock-fetch.ts`
- Test: `test/unit/http.test.ts`

**Interfaces:**
- Consumes: errors (Task 2), `CookieStore` (Task 4)
- Produces (`src/core/services.ts`):
  - `type Service = "chat" | "manager" | "account"`
  - `DEFAULT_BASE_URLS: Readonly<Record<Service, string>>` = `chat: "https://chat.line.biz"`, `manager: "https://manager.line.biz"`, `account: "https://account.line.biz"`
  - `DEFAULT_USER_AGENT` = `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"`, `DEFAULT_CLIENT_VERSION` = `"20240513144702"`
  - `isAllowedAbsoluteURL(url: URL): boolean` — `https:` และ host เท่ากับ/ลงท้าย `line.biz` หรือ `line.me` (`.line.biz` / `.line.me`)
- Produces (`src/core/http.ts`):
  - `type QueryValue = string | number | boolean | readonly string[] | undefined`
  - `interface RequestDescriptor { service: Service; method: "GET" | "POST"; path: string; query?: Record<string, QueryValue>; body?: unknown; absoluteURL?: string; allowRedirect?: boolean }`
  - `interface RequestOptions { signal?: AbortSignal; timeout?: number; headers?: Record<string, string> }`
  - `interface RequestContext { method: string; url: string; headers: Record<string, string>; attempt: number }`, `interface ResponseContext extends RequestContext { status: number; responseHeaders: Record<string, string>; durationMs: number }`, `interface ErrorContext extends RequestContext { error: LineBizError }`
  - `interface Hooks { onRequest?(ctx: RequestContext): void | Promise<void>; onResponse?(ctx: ResponseContext): void | Promise<void>; onError?(ctx: ErrorContext): void | Promise<void> }`
  - `interface HttpConfig { baseURLs: Record<Service, string>; fetch: typeof globalThis.fetch; headers: Record<string, string>; userAgent: string; clientVersion: string; timeout: number; maxRetries: number; cookieStore: CookieStore; hooks: Hooks; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> }`
  - `buildURL(baseURL: string, path: string, query?: Record<string, QueryValue>): URL` — `undefined` ข้าม; array join ด้วย `,`; ใช้ `URLSearchParams`
  - `class HttpClient { constructor(config: HttpConfig); readonly config: HttpConfig; request<T>(desc: RequestDescriptor, options?: RequestOptions): Promise<T> }`
- Produces (`test/helpers/mock-fetch.ts`): `mockFetch(...responders: Array<Response | ((req: Request) => Response | Promise<Response>)>): { fetch: typeof globalThis.fetch; calls: Request[] }` — ตอบตามลำดับ; เรียกเกินจำนวน → throw; `json(body: unknown, init?: ResponseInit): Response` helper
- พฤติกรรม `request` (Task นี้ยังไม่ทำ timeout/retry — ใช้ attempt เดียว):
  1. URL: `absoluteURL` ถ้ามี (ต้องผ่าน `isAllowedAbsoluteURL` มิฉะนั้น reject `UnexpectedResponseError` "Refusing to call non-LINE URL") ไม่งั้น `buildURL(baseURLs[service], path, query)`
  2. Header ลำดับความสำคัญ: defaults (`User-Agent`, `Accept: application/json`, `x-oa-chat-client-version` เฉพาะ service `chat`, `Content-Type: application/json` เมื่อมี body) < `config.headers` < `options.headers`; แล้วตั้ง `Cookie` จาก `cookieStore.getCookieHeader(url)` (ไม่ตั้งถ้าว่าง)
  3. `onRequest` (headers ผ่าน `redactHeaders`); ถ้า throw → reject ด้วย error นั้น ไม่ยิง request
  4. `fetch(url, { method, headers, body: JSON.stringify(body), redirect: "manual", signal })`; `TypeError`/อื่น ๆ จาก fetch → `ConnectionError` (cause = ตัวเดิม)
  5. ทุก response: ถ้า `headers.getSetCookie()` ไม่ว่าง → `await cookieStore.setCookies?.(url, list)` **ก่อน** ตรวจ status
  6. `3xx`: ถ้า `desc.allowRedirect` → resolve `undefined`; ไม่งั้น reject `UnexpectedResponseError` (`status`, `location` จาก header) — ไม่ follow
  7. ไม่ใช่ 2xx: อ่าน text → JSON.parse ได้ใช้ object ไม่ได้ใช้ `truncateBody(text)` → `APIError.from(...)`
  8. 2xx: text ว่าง → `undefined`; JSON.parse fail → `UnexpectedResponseError` (`status`, body = `truncateBody(text)`)
  9. `onResponse` เมื่อได้ response (ทุก status); `onError` เรียกครั้งเดียวกับ error สุดท้าย; error จาก `onResponse`/`onError` ถูกกลืน

- [ ] **Step 1: เขียน failing tests** (สร้าง `HttpClient` ด้วย helper `make(overrides)` ที่ใช้ `MemoryCookieStore("ses=S")`, `maxRetries: 0`, `timeout: 30_000`)

```ts
it("buildURL encodes and joins arrays", () => expect(buildURL("https://chat.line.biz", "/api/v2/bots/B/chats", { tagIds: ["a", "b c"], next: "x&y", skip: undefined }).toString()).toBe("https://chat.line.biz/api/v2/bots/B/chats?tagIds=a%2Cb+c&next=x%26y"));
it("resolves base URL per service and sends chat headers", async () => { const m = mockFetch(json({ ok: 1 })); await make({ fetch: m.fetch }).request({ service: "chat", method: "GET", path: "/api/v1/me" }); const r = m.calls[0]!; expect(r.url).toBe("https://chat.line.biz/api/v1/me"); expect(r.headers.get("x-oa-chat-client-version")).toBe(DEFAULT_CLIENT_VERSION); expect(r.headers.get("cookie")).toBe("ses=S"); });
it("no chat client-version header for manager", async () => { const m = mockFetch(json({})); await make({ fetch: m.fetch }).request({ service: "manager", method: "GET", path: "/x" }); expect(m.calls[0]!.headers.has("x-oa-chat-client-version")).toBe(false); });
it("header precedence default < client < request", async () => { const m = mockFetch(json({})); await make({ fetch: m.fetch, headers: { "User-Agent": "client", "X-A": "1" } }).request({ service: "chat", method: "GET", path: "/" }, { headers: { "X-A": "2" } }); expect(m.calls[0]!.headers.get("user-agent")).toBe("client"); expect(m.calls[0]!.headers.get("x-a")).toBe("2"); });
it("POST sends JSON body", async () => { const m = mockFetch(json({})); await make({ fetch: m.fetch }).request({ service: "chat", method: "POST", path: "/p", body: { a: 1 } }); expect(await m.calls[0]!.json()).toEqual({ a: 1 }); expect(m.calls[0]!.headers.get("content-type")).toBe("application/json"); });
it("maps 401 not_login", async () => { const m = mockFetch(json({ code: "not_login" }, { status: 401 })); await expect(make({ fetch: m.fetch }).request({ service: "chat", method: "GET", path: "/" })).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 401 }); });
it("network failure → ConnectionError", async () => { const m = mockFetch(() => { throw new TypeError("fetch failed"); }); await expect(make({ fetch: m.fetch }).request({ service: "chat", method: "GET", path: "/" })).rejects.toBeInstanceOf(ConnectionError); });
// Review Focus 1
it("does not follow 3xx and reports location", async () => { const m = mockFetch(new Response(null, { status: 302, headers: { location: "https://evil.example/login" } })); await expect(make({ fetch: m.fetch }).request({ service: "chat", method: "GET", path: "/" })).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE", status: 302, location: "https://evil.example/login" }); expect(m.calls).toHaveLength(1); });
it("allowRedirect resolves undefined on 3xx", async () => { const m = mockFetch(new Response(null, { status: 302, headers: { location: "/" } })); await expect(make({ fetch: m.fetch }).request({ service: "account", method: "GET", path: "/", allowRedirect: true })).resolves.toBeUndefined(); });
// Review Focus 2
it("stores Set-Cookie even on error responses", async () => { const store = new MemoryCookieStore("ses=S"); const m = mockFetch(new Response("{}", { status: 401, headers: [["set-cookie", "ses=; Domain=line.biz; Path=/; Max-Age=0"]] })); await expect(make({ fetch: m.fetch, cookieStore: store }).request({ service: "chat", method: "GET", path: "/" })).rejects.toBeInstanceOf(AuthenticationError); expect(store.getCookieHeader(new URL("https://chat.line.biz/"))).toBe(""); });
// Review Focus 3
it("HTML 200 → UnexpectedResponseError", async () => { const m = mockFetch(new Response("<html>maintenance</html>", { status: 200 })); await expect(make({ fetch: m.fetch }).request({ service: "chat", method: "GET", path: "/" })).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE", status: 200 }); });
it("empty 200 → undefined", async () => { const m = mockFetch(new Response("", { status: 200 })); await expect(make({ fetch: m.fetch }).request({ service: "chat", method: "GET", path: "/" })).resolves.toBeUndefined(); });
it("absoluteURL must be LINE host", async () => { const m = mockFetch(); await expect(make({ fetch: m.fetch }).request({ service: "account", method: "GET", path: "", absoluteURL: "https://evil.example/" })).rejects.toBeInstanceOf(UnexpectedResponseError); expect(m.calls).toHaveLength(0); });
it("hooks see redacted cookie; onRequest throw aborts; onResponse throw ignored", async () => {
  const seen: string[] = []; const m = mockFetch(json({}));
  await make({ fetch: m.fetch, hooks: { onRequest: (c) => { seen.push(c.headers.Cookie ?? c.headers.cookie ?? ""); }, onResponse: () => { throw new Error("ignored"); } } }).request({ service: "chat", method: "GET", path: "/" });
  expect(seen).toEqual(["[REDACTED]"]);
  const boom = new Error("stop"); await expect(make({ fetch: mockFetch().fetch, hooks: { onRequest: () => { throw boom; } } }).request({ service: "chat", method: "GET", path: "/" })).rejects.toBe(boom);
});
it("onError receives final error", async () => { const errs: unknown[] = []; const m = mockFetch(json({}, { status: 404 })); await expect(make({ fetch: m.fetch, hooks: { onError: (c) => { errs.push(c.error); } } }).request({ service: "chat", method: "GET", path: "/" })).rejects.toBeInstanceOf(NotFoundError); expect(errs).toHaveLength(1); });
```

- [ ] **Step 2: Run** `pnpm test -- http` → FAIL
- [ ] **Step 3: Implement** `services.ts`, `http.ts`, `mock-fetch.ts` ตาม Interfaces
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add fetch-based HTTP pipeline with cookie store and hooks"`

---

### Task 7: Timeout, abort, retry

**Files:**
- Modify: `src/core/http.ts`
- Test: `test/unit/http-retry.test.ts`

**Interfaces:**
- Consumes: `HttpClient`, `HttpConfig.sleep`, `parseRetryAfter`, `backoffDelay`, `isRetryableStatus`, `RateLimitError`, `TimeoutError`, `AbortError`
- Produces: พฤติกรรมเพิ่มใน `HttpClient.request` (signature เดิม)
  - signal ต่อ attempt = `AbortSignal.any([options.signal, AbortSignal.timeout(options.timeout ?? config.timeout)])` (ข้าม `options.signal` ถ้าไม่มี)
  - abort มาจาก `options.signal` → `AbortError` (ไม่ retry); มาจาก timeout → `TimeoutError` (retry ได้)
  - Retry เฉพาะ `method === "GET"`, สูงสุด `maxRetries` ครั้ง, เมื่อ: `ConnectionError`/`TimeoutError` หรือ `APIError` ที่ `isRetryableStatus(status)`
  - Delay: `RateLimitError.retryAfter` ถ้ามี ไม่งั้น `backoffDelay(attempt)`; default `sleep` = `setTimeout` ที่ยกเลิกได้ด้วย `options.signal` (abort ระหว่าง sleep → `AbortError`)
  - `RequestContext.attempt` เริ่ม 0 เพิ่มทีละ 1 ต่อ retry

- [ ] **Step 1: เขียน failing tests** (ใช้ `sleep` ปลอมที่บันทึก delay และ resolve ทันที)

```ts
const delays: number[] = []; const sleep = (ms: number) => { delays.push(ms); return Promise.resolve(); };
it("retries 503 then succeeds", async () => { const m = mockFetch(json({}, { status: 503 }), json({ ok: true })); await expect(make({ fetch: m.fetch, maxRetries: 2, sleep }).request({ service: "chat", method: "GET", path: "/" })).resolves.toEqual({ ok: true }); expect(m.calls).toHaveLength(2); });
it("honours Retry-After on 429", async () => { delays.length = 0; const m = mockFetch(json({}, { status: 429, headers: { "retry-after": "3" } }), json({})); await make({ fetch: m.fetch, maxRetries: 1, sleep }).request({ service: "chat", method: "GET", path: "/" }); expect(delays).toEqual([3000]); });
it("gives up after maxRetries", async () => { const m = mockFetch(json({}, { status: 500 }), json({}, { status: 500 }), json({}, { status: 500 })); await expect(make({ fetch: m.fetch, maxRetries: 2, sleep }).request({ service: "chat", method: "GET", path: "/" })).rejects.toBeInstanceOf(InternalServerError); expect(m.calls).toHaveLength(3); });
it("never retries POST", async () => { const m = mockFetch(json({}, { status: 503 })); await expect(make({ fetch: m.fetch, maxRetries: 2, sleep }).request({ service: "chat", method: "POST", path: "/" })).rejects.toBeInstanceOf(InternalServerError); expect(m.calls).toHaveLength(1); });
it("never retries 404", async () => { const m = mockFetch(json({}, { status: 404 })); await expect(make({ fetch: m.fetch, maxRetries: 2, sleep }).request({ service: "chat", method: "GET", path: "/" })).rejects.toBeInstanceOf(NotFoundError); expect(m.calls).toHaveLength(1); });
it("timeout → TimeoutError", async () => { const hang = (req: Request) => new Promise<Response>((_, rej) => req.signal.addEventListener("abort", () => rej(req.signal.reason))); const m = mockFetch(hang); await expect(make({ fetch: m.fetch, maxRetries: 0 }).request({ service: "chat", method: "GET", path: "/" }, { timeout: 20 })).rejects.toBeInstanceOf(TimeoutError); });
it("user abort → AbortError, no retry", async () => { const ac = new AbortController(); ac.abort(); const m = mockFetch(json({})); await expect(make({ fetch: m.fetch, maxRetries: 2, sleep }).request({ service: "chat", method: "GET", path: "/" }, { signal: ac.signal })).rejects.toBeInstanceOf(AbortError); });
// Review Focus 4
it("abort during backoff stops immediately", async () => { const ac = new AbortController(); const m = mockFetch(json({}, { status: 503 }), json({})); const p = make({ fetch: m.fetch, maxRetries: 2 }).request({ service: "chat", method: "GET", path: "/" }, { signal: ac.signal }); setTimeout(() => ac.abort(), 10); await expect(p).rejects.toBeInstanceOf(AbortError); expect(m.calls).toHaveLength(1); });
it("attempt counter in hooks", async () => { const attempts: number[] = []; const m = mockFetch(json({}, { status: 502 }), json({})); await make({ fetch: m.fetch, maxRetries: 1, sleep, hooks: { onRequest: (c) => { attempts.push(c.attempt); } } }).request({ service: "chat", method: "GET", path: "/" }); expect(attempts).toEqual([0, 1]); });
```

- [ ] **Step 2: Run** `pnpm test -- http-retry` → FAIL
- [ ] **Step 3: Implement** retry loop + timeout/abort ใน `HttpClient.request`
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add timeout, abort and retry with backoff"`

---

### Task 8: Pagination

**Files:**
- Create: `src/core/pagination.ts`
- Test: `test/unit/pagination.test.ts`

**Interfaces:**
- Consumes: `UnexpectedResponseError`
- Produces:
  - `interface FetchedPage<T> { items: T[]; nextCursor: string | undefined; raw: unknown }`
  - `type PageFetcher<T> = (cursor: string | undefined) => Promise<FetchedPage<T>>`
  - `readListResponse<T>(raw: unknown, cursorField: "next" | "backward"): FetchedPage<T>` — `raw.list` ต้องเป็น array; cursor ต้องเป็น string หรือ `undefined`/`null` (null → undefined; string ว่าง → undefined) มิฉะนั้น `UnexpectedResponseError`
  - `class Page<T> { readonly data: T[]; readonly nextCursor: string | undefined; readonly raw: unknown; hasNextPage(): boolean; getNextPage(): Promise<Page<T>> }` — `getNextPage` เมื่อไม่มีหน้าถัดไป → reject `LineBizError`-subclass `UnexpectedResponseError("No next page")`; ถ้าหน้าใหม่ได้ cursor เท่ากับ cursor ที่ใช้ขอ → `UnexpectedResponseError("Pagination cursor did not advance")`
  - `class PagePromise<T> extends Promise<Page<T>> implements AsyncIterable<T>` — `static get [Symbol.species](): PromiseConstructor` คืน `Promise`; `[Symbol.asyncIterator](): AsyncIterator<T>`; `toArray(options?: { maxPages?: number; maxItems?: number }): Promise<T[]>`
  - `paginate<T>(fetcher: PageFetcher<T>, initialCursor?: string): PagePromise<T>` — เรียก fetcher หน้าแรกทันที; error ใด ๆ (รวม `ValidationError` ที่ fetcher throw) ทำให้ promise reject

- [ ] **Step 1: เขียน failing tests**

```ts
const pages: Record<string, FetchedPage<number>> = { start: { items: [1, 2], nextCursor: "b", raw: {} }, b: { items: [3], nextCursor: "c", raw: {} }, c: { items: [4], nextCursor: undefined, raw: {} } };
const fetcher = vi.fn((c: string | undefined) => Promise.resolve(pages[c ?? "start"]!));
beforeEach(() => fetcher.mockClear());
it("first page", async () => { const p = await paginate(fetcher); expect(p.data).toEqual([1, 2]); expect(p.hasNextPage()).toBe(true); });
it("getNextPage", async () => expect((await (await paginate(fetcher)).getNextPage()).data).toEqual([3]));
it("for await iterates all items", async () => { const out: number[] = []; for await (const n of paginate(fetcher)) out.push(n); expect(out).toEqual([1, 2, 3, 4]); expect(fetcher).toHaveBeenCalledTimes(3); });
it("break stops fetching", async () => { for await (const n of paginate(fetcher)) { if (n === 2) break; } expect(fetcher).toHaveBeenCalledTimes(1); });
it("toArray limits", async () => { expect(await paginate(fetcher).toArray({ maxPages: 2 })).toEqual([1, 2, 3]); expect(await paginate(fetcher).toArray({ maxItems: 3 })).toEqual([1, 2, 3]); });
it("resume from cursor", async () => expect((await paginate(fetcher, "b")).data).toEqual([3]));
it("cursor that does not advance", async () => { const stuck: PageFetcher<number> = () => Promise.resolve({ items: [1], nextCursor: "same", raw: {} }); await expect(paginate(stuck, "same").toArray()).rejects.toThrow(/did not advance/); });
it("readListResponse validates shape", () => { expect(readListResponse({ list: [1], backward: "x" }, "backward")).toEqual({ items: [1], nextCursor: "x", raw: { list: [1], backward: "x" } }); expect(readListResponse({ list: [], next: null }, "next").nextCursor).toBeUndefined(); expect(() => readListResponse({ list: "nope" }, "next")).toThrow(UnexpectedResponseError); expect(() => readListResponse(undefined, "next")).toThrow(UnexpectedResponseError); });
it("fetcher error rejects", async () => { await expect(paginate(() => Promise.reject(new ValidationError({ param: "p", value: 1, reason: "r" })))).rejects.toBeInstanceOf(ValidationError); });
it("then() returns a plain Promise", () => expect(paginate(fetcher).then((x) => x)).not.toBeInstanceOf(PagePromise));
```

- [ ] **Step 2: Run** `pnpm test -- pagination` → FAIL
- [ ] **Step 3: Implement** `src/core/pagination.ts`
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add cursor pagination with async iteration"`

---

### Task 9: LineBizClient + me/bots/owners/tags

**Files:**
- Create: `src/client.ts`, `src/resources/{resource,me,bots,owners,tags}.ts`
- Modify: `src/index.ts`
- Test: `test/unit/client.test.ts`, `test/unit/resources-basic.test.ts`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 2–8, fixtures จาก Task 1
- Produces:
  - `interface ClientOptions` ตาม spec §5 ทุก field (`cookies?: CookieInput; cookieStore?: CookieStore; baseURLs?: Partial<Record<Service, string>>; fetch?: typeof globalThis.fetch; headers?: Record<string, string>; userAgent?: string; clientVersion?: string; timeout?: number; maxRetries?: number; validate?: boolean; hooks?: Hooks`)
  - `class LineBizClient`:
    - `constructor(options: ClientOptions)` — ตรวจ: ต้องมี `cookies` หรือ `cookieStore` อย่างใดอย่างหนึ่ง (ทั้งคู่/ไม่มีเลย → `ConfigError` `INVALID_OPTIONS`); `cookies` → `new MemoryCookieStore(cookies)`; `timeout` int > 0 (default `30_000`); `maxRetries` int 0–10 (default `2`); `baseURLs` แต่ละค่าต้อง `new URL()` ได้; `fetch` default `globalThis.fetch`
    - `readonly me: MeResource; readonly bots: BotsResource; readonly owners: OwnersResource; readonly tags: TagsResource` (+ Task 10: `chats`, `messages`, `contacts`, `members`, `auth`)
    - `withOptions(options: Omit<ClientOptions, "cookies" | "cookieStore">): LineBizClient` — merge กับ options เดิม ใช้ cookie store ตัวเดิม
    - `exportCookies(): Promise<CookieObject[]>` — store เป็น `MemoryCookieStore` → `toJSON()`; ไม่ใช่ → reject `ConfigError`
    - `/** @internal */ readonly _http: HttpClient`, `/** @internal */ readonly _validator: Validator`
  - `abstract class APIResource { protected readonly _client: LineBizClient; constructor(client: LineBizClient) }`
  - `MeResource.retrieve(options?: RequestOptions): Promise<Me>` → `GET chat /api/v1/me`
  - `BotsResource.list(params?: { limit?: number; cursor?: string }, options?: RequestOptions): PagePromise<Bot>` → `GET /api/v1/bots` query `noFilter=true`, `limit` (1–1000, default 1000), `next=cursor`
  - `BotsResource.retrieve(botId: string, options?: RequestOptions): Promise<BotDetail>` → `GET /api/v1/bots/{botId}?noFilter=true`
  - `OwnersResource.list(botId: string, params?: { bizIds?: string[] }, options?: RequestOptions): Promise<Owner[]>` → `GET /api/v1/bots/{botId}/owners` query `bizIds` → คืน `raw.list` (ผ่าน `readListResponse`)
  - `TagsResource.list(botId: string, params?: { tagIds?: string[] }, options?: RequestOptions): Promise<Tag[]>` → `GET /api/v1/bots/{botId}/tags` query `tagIds`
  - path segment ทุกตัวผ่าน `encodeURIComponent`; validation ทั้งหมดทำใน `async` function / ภายใน fetcher เพื่อให้ reject เสมอ
  - `src/index.ts` export: `LineBizClient`, `ClientOptions`, ทุก error class + `LineBizErrorCode` + `isLineBizError`, `MemoryCookieStore`, `CookieStore`, `CookieObject`, `CookieInput`, `Page`, `PagePromise`, `RequestOptions`, `Hooks`, `RequestContext`, `ResponseContext`, `ErrorContext`, `Service`, และ `export type * from "./types/index.js"`

- [ ] **Step 1: เขียน failing tests**

```ts
// test/unit/client.test.ts
it("requires exactly one of cookies/cookieStore", () => { expect(() => new LineBizClient({})).toThrow(ConfigError); expect(() => new LineBizClient({ cookies: "a=1", cookieStore: new MemoryCookieStore("a=1") })).toThrow(ConfigError); });
it.each([{ timeout: 0 }, { maxRetries: 11 }, { baseURLs: { chat: "not a url" } }])("rejects bad option %o", (o) => expect(() => new LineBizClient({ cookies: "a=1", ...o })).toThrow(ConfigError));
it("baseURLs override + custom fetch", async () => { const m = mockFetch(json(meFixture)); await new LineBizClient({ cookies: "a=1", fetch: m.fetch, baseURLs: { chat: "http://localhost:9999" } }).me.retrieve(); expect(m.calls[0]!.url).toBe("http://localhost:9999/api/v1/me"); });
it("withOptions keeps cookie store and does not mutate original", async () => { const m = mockFetch(json(meFixture), json(meFixture)); const c1 = new LineBizClient({ cookies: "a=1", fetch: m.fetch }); const c2 = c1.withOptions({ headers: { "X-T": "1" } }); await c2.me.retrieve(); await c1.me.retrieve(); expect(m.calls[0]!.headers.get("x-t")).toBe("1"); expect(m.calls[1]!.headers.has("x-t")).toBe(false); expect(m.calls[1]!.headers.get("cookie")).toBe("a=1"); });
it("exportCookies", async () => { expect(await new LineBizClient({ cookies: "a=1" }).exportCookies()).toEqual([expect.objectContaining({ name: "a", value: "1" })]); await expect(new LineBizClient({ cookieStore: { getCookieHeader: () => "" } }).exportCookies()).rejects.toBeInstanceOf(ConfigError); });

// test/unit/resources-basic.test.ts  (helper: client(m) = new LineBizClient({ cookies: "a=1", fetch: m.fetch, maxRetries: 0 }); BOT = "U" + "0".repeat(32))
it("me.retrieve", async () => { const m = mockFetch(json(meFixture)); expect(await client(m).me.retrieve()).toEqual(meFixture); });
it("bots.list URL + paging", async () => { const m = mockFetch(json({ ...botsPageFixture, next: "n1" }), json({ list: [], next: undefined })); const all = await client(m).bots.list({ limit: 10 }).toArray(); expect(new URL(m.calls[0]!.url).search).toBe("?noFilter=true&limit=10"); expect(new URL(m.calls[1]!.url).searchParams.get("next")).toBe("n1"); expect(all).toHaveLength(botsPageFixture.list.length); });
it("bots.list default limit 1000 and range", async () => { const m = mockFetch(json(botsPageFixture)); await client(m).bots.list(); expect(new URL(m.calls[0]!.url).searchParams.get("limit")).toBe("1000"); await expect(client(mockFetch()).bots.list({ limit: 1001 })).rejects.toBeInstanceOf(ValidationError); });
it("bots.retrieve", async () => { const m = mockFetch(json(botDetailFixture)); await client(m).bots.retrieve(BOT); expect(m.calls[0]!.url).toBe(`https://chat.line.biz/api/v1/bots/${BOT}?noFilter=true`); });
it("invalid botId rejects without request", async () => { const m = mockFetch(); await expect(client(m).bots.retrieve("bad")).rejects.toBeInstanceOf(ValidationError); expect(m.calls).toHaveLength(0); });
it("validate:false lets odd IDs through but encodes them", async () => { const m = mockFetch(json(botDetailFixture)); await new LineBizClient({ cookies: "a=1", fetch: m.fetch, validate: false }).bots.retrieve("a/b"); expect(m.calls[0]!.url).toContain("/bots/a%2Fb?"); });
it("owners.list bizIds", async () => { const m = mockFetch(json(ownersFixture)); const ids = ["123e4567-e89b-12d3-a456-426614174000"]; expect(await client(m).owners.list(BOT, { bizIds: ids })).toEqual(ownersFixture.list); expect(new URL(m.calls[0]!.url).searchParams.get("bizIds")).toBe(ids[0]); });
it("tags.list validates tagIds (regression: previously unvalidated)", async () => { await expect(client(mockFetch()).tags.list(BOT, { tagIds: ["bad id"] })).rejects.toBeInstanceOf(ValidationError); const m = mockFetch(json(tagsFixture)); expect(await client(m).tags.list(BOT, { tagIds: ["t1", "t2"] })).toEqual(tagsFixture.list); expect(new URL(m.calls[0]!.url).searchParams.get("tagIds")).toBe("t1,t2"); });
```

- [ ] **Step 2: Run** `pnpm test -- client resources-basic` → FAIL
- [ ] **Step 3: Implement** `client.ts`, `resources/{resource,me,bots,owners,tags}.ts`, `index.ts`
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: add LineBizClient with me, bots, owners and tags resources"`

---

### Task 10: chats / messages / contacts / members / auth

**Files:**
- Create: `src/resources/{chats,messages,contacts,members,auth}.ts`
- Modify: `src/client.ts` (เพิ่ม properties)
- Test: `test/unit/resources-chat.test.ts`

**Interfaces:**
- Consumes: `APIResource`, `paginate`, `readListResponse`, `Validator`, fixtures
- Produces (ค่า default/ช่วงตาม spec §7):
  - `ChatsResource.list(botId: string, params?: { limit?: number; tagIds?: string[]; folderType?: string; prioritizePinned?: boolean; cursor?: string }, options?: RequestOptions): PagePromise<Chat>` → `GET /api/v2/bots/{botId}/chats` query ตามลำดับ `folderType` (default `"ALL"`), `tagIds` (join `,`, default `""`), `autoTagIds=""`, `limit` (1–25, default 25), `prioritizePinnedChat` (default `true`), `next`
  - `MessagesResource.list(botId: string, chatId: string, params?: { cursor?: string }, options?: RequestOptions): PagePromise<MessageEvent>` → `GET /api/v3/bots/{botId}/chats/{chatId}/messages` query `backward`; cursor field `"backward"`
  - `MessagesResource.retrieveFlex(botId: string, chatId: string, messageId: string, params?: { timestamp?: string }, options?: RequestOptions): Promise<FlexContainer>` → `GET /api/v1/bots/{botId}/chats/{chatId}/messages/flexJson` query `messageId`, `timestamp` (digits)
  - `type ContactFilter = "ALL" | "FRIEND" | "NOT_FRIEND" | "GROUP" | "SPAM"`, `type ContactSortBy = "DISPLAY_NAME" | "LAST_TALKED_AT"`, `type SortOrder = "ASC" | "DESC"` (export จาก root)
  - `ContactsResource.list(botId: string, params?: { query?: string; filter?: ContactFilter; sortBy?: ContactSortBy; order?: SortOrder; limit?: number; cursor?: string }, options?: RequestOptions): PagePromise<Contact>` → `GET /api/v2/bots/{botId}/contacts` query `query` (default `""`), `sortKey` (default `DISPLAY_NAME`), `sortOrder` (default `ASC`), `filterKey` (default `ALL`), `limit` (1–100, default 20), `next`
  - `MembersResource.list(botId: string, chatId: string, params?: { userIds?: string[]; limit?: number; cursor?: string }, options?: RequestOptions): PagePromise<Member>` → `GET /api/v1/bots/{botId}/chats/{chatId}/members` query `limit` (1–100, default 100), `userIds` (แต่ละตัวผ่าน `id`), `next`
  - `AuthResource.logout(options?: RequestOptions): Promise<void>` → `POST chat /api/v1/logoutUri` body `{ redirectPath: "/" }`; response ต้องมี `logoutUri: string` ไม่งั้น `UnexpectedResponseError`; จากนั้น `GET` `absoluteURL: logoutUri`, `service: "account"`, `allowRedirect: true`
  - `LineBizClient` เพิ่ม `readonly chats`, `messages`, `contacts`, `members`, `auth`

- [ ] **Step 1: เขียน failing tests** (helper `client(m)` และ `BOT` เหมือน Task 9; `CHAT = "C" + "1".repeat(32)`, `USER = "U" + "2".repeat(32)`)

```ts
it("chats.list query shape", async () => { const m = mockFetch(json(chatsPageFixture)); await client(m).chats.list(BOT, { tagIds: ["t1"] }); const q = new URL(m.calls[0]!.url).searchParams; expect(m.calls[0]!.url).toContain(`/api/v2/bots/${BOT}/chats?`); expect(Object.fromEntries(q)).toEqual({ folderType: "ALL", tagIds: "t1", autoTagIds: "", limit: "25", prioritizePinnedChat: "true" }); });
it("chats.list limit range", async () => await expect(client(mockFetch()).chats.list(BOT, { limit: 26 })).rejects.toThrow(/between 1 and 25/));
it("messages.list uses backward cursor", async () => { const m = mockFetch(json({ ...messagesPageFixture, backward: "B1" }), json({ list: [] })); const all = await client(m).messages.list(BOT, CHAT).toArray(); expect(new URL(m.calls[1]!.url).searchParams.get("backward")).toBe("B1"); expect(all).toHaveLength(messagesPageFixture.list.length); });
it("messages.list resume", async () => { const m = mockFetch(json({ list: [] })); await client(m).messages.list(BOT, CHAT, { cursor: "B9" }); expect(new URL(m.calls[0]!.url).searchParams.get("backward")).toBe("B9"); });
it("retrieveFlex", async () => { const m = mockFetch(json(flexFixture)); expect(await client(m).messages.retrieveFlex(BOT, CHAT, "123", { timestamp: "1700000000000" })).toEqual(flexFixture); expect(Object.fromEntries(new URL(m.calls[0]!.url).searchParams)).toEqual({ messageId: "123", timestamp: "1700000000000" }); await expect(client(mockFetch()).messages.retrieveFlex(BOT, CHAT, "12a")).rejects.toBeInstanceOf(ValidationError); });
// regression: old getContactByName never sent `next`
it("contacts.list sends next cursor on page 2", async () => { const m = mockFetch(json({ ...contactsPageFixture, next: "N2" }), json({ list: [] })); await client(m).contacts.list(BOT, { query: "สมชาย & co" }).toArray(); const q1 = new URL(m.calls[0]!.url).searchParams; expect(q1.get("query")).toBe("สมชาย & co"); expect(q1.get("limit")).toBe("20"); expect(q1.get("filterKey")).toBe("ALL"); expect(new URL(m.calls[1]!.url).searchParams.get("next")).toBe("N2"); });
it("contacts.list enum validation", async () => await expect(client(mockFetch()).contacts.list(BOT, { filter: "friend" as never })).rejects.toBeInstanceOf(ValidationError));
it("members.list", async () => { const m = mockFetch(json(membersPageFixture)); await client(m).members.list(BOT, CHAT, { userIds: [USER] }); const q = new URL(m.calls[0]!.url).searchParams; expect(q.get("limit")).toBe("100"); expect(q.get("userIds")).toBe(USER); });
it("auth.logout calls logoutUri on account host without following redirects", async () => { const m = mockFetch(json({ logoutUri: "https://account.line.biz/logout?x=1" }), new Response(null, { status: 302, headers: { location: "https://access.line.me/" } })); await client(m).auth.logout(); expect(m.calls[0]!.method).toBe("POST"); expect(await m.calls[0]!.json()).toEqual({ redirectPath: "/" }); expect(m.calls[1]!.url).toBe("https://account.line.biz/logout?x=1"); expect(m.calls).toHaveLength(2); });
it("auth.logout refuses foreign logoutUri", async () => { const m = mockFetch(json({ logoutUri: "https://evil.example/" })); await expect(client(m).auth.logout()).rejects.toBeInstanceOf(UnexpectedResponseError); expect(m.calls).toHaveLength(1); });
it("auth.logout missing logoutUri", async () => await expect(client(mockFetch(json({}))).auth.logout()).rejects.toBeInstanceOf(UnexpectedResponseError));
```

- [ ] **Step 2: Run** `pnpm test -- resources-chat` → FAIL
- [ ] **Step 3: Implement** resource files + wire เข้า `LineBizClient`
- [ ] **Step 4: Run** `pnpm check` → PASS (lint, typecheck, test, build)
- [ ] **Step 5: Commit** `git commit -m "feat: add chats, messages, contacts, members and auth resources"`

---

### Task 11: Docs, license, notices, integration tests

**Files:**
- Create: `README.md`, `README.th.md`, `THIRD_PARTY_NOTICES.md`, `.github/FUNDING.yml` (`git mv FUNDING.yml .github/FUNDING.yml`), `test/integration/read-only.test.ts`
- Modify: `LICENSE`

**Interfaces:**
- Consumes: public API ทั้งหมด (Task 9–10)
- Produces: เอกสาร + integration suite

- [ ] **Step 1: เขียน integration test** `test/integration/read-only.test.ts`

```ts
const cookies = process.env.LINEBIZ_COOKIES; const botId = process.env.LINEBIZ_BOT_ID;
describe.skipIf(!cookies)("live read-only", () => {
  const client = new LineBizClient({ cookies: cookies! });
  it("me.retrieve", async () => expect(typeof (await client.me.retrieve()).bizId).toBe("string"));
  it("bots.list first page", async () => expect(Array.isArray((await client.bots.list({ limit: 5 })).data)).toBe(true));
  it.skipIf(!botId)("chats.list first page", async () => expect(Array.isArray((await client.chats.list(botId!, { limit: 5 })).data)).toBe(true));
  it.skipIf(!botId)("tags.list", async () => expect(Array.isArray(await client.tags.list(botId!))).toBe(true));
});
```
ห้ามเรียก `auth.logout()` ใน suite นี้

- [ ] **Step 2: Run** `pnpm test:integration` (ไม่มี env) → Expected: tests ถูก skip ทั้งหมด, exit 0

- [ ] **Step 3: เขียนเอกสาร**
  - `LICENSE`: ข้อความ ISC เดิม เปลี่ยนบรรทัดแรกเป็น `Copyright (c) 2025-2026 linebiz contributors`
  - `THIRD_PARTY_NOTICES.md`: ระบุว่า `dist/**/*.d.ts` มี type definitions ที่มาจาก `@line/bot-sdk` (Copyright LINE Corporation, Apache License 2.0) + ข้อความ Apache-2.0 ฉบับเต็มจาก `node_modules/@line/bot-sdk/LICENSE` (ถ้า Task 1 Step 6 ต้องเขียน type เอง → ไม่สร้างไฟล์นี้ และเอาออกจาก `files`)
  - `README.md` (อังกฤษ) หัวข้อ: Disclaimer (unofficial, ไม่เกี่ยวข้องกับ LY Corporation/LINE, API ภายในเปลี่ยนได้ทุกเมื่อ, ผู้ใช้รับผิดชอบเรื่อง ToS), Install (`pnpm add @prakrit_m/linebiz`, Node ≥22, ESM-only + `require(esm)` ใช้ได้บน Node ≥22.12), Quick start, Cookies (3 รูปแบบ input, `CookieStore` ตัวอย่าง Redis-backed store, `exportCookies`), Client options (ตารางตาม spec §5), Pagination (await / for await / toArray / cursor), Errors (ตาราง class → code), Hooks (ตัวอย่าง logging), Resources (ตาราง method ตาม spec §7), Integration tests (`LINEBIZ_COOKIES`, `LINEBIZ_BOT_ID`), License
  - `README.th.md`: เนื้อหาเดียวกันเป็นภาษาไทย; ทั้งสองไฟล์มีลิงก์หากันที่บรรทัดแรก
  - ตัวอย่างโค้ดใน README ต้องตรงกับ signature ใน Task 9–10

- [ ] **Step 4: Run** `pnpm check && pnpm format && git diff --stat` → Expected: ผ่าน; format ไม่เปลี่ยนโค้ด src

- [ ] **Step 5: Commit** `git add -A && git commit -m "docs: add README (en/th), license holder, third-party notices and integration tests"`

---

### Task 12: CI/CD + release config + final package verification

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.changeset/config.json`
- Modify: `package.json` (scripts `changeset`, `release`; devDependency `@changesets/cli@^3.0.3`)

**Interfaces:**
- Consumes: scripts จาก Task 1
- Produces: workflows

- [ ] **Step 1: ตั้ง Changesets**

`pnpm add -D @changesets/cli@^3.0.3`; scripts: `"changeset": "changeset"`, `"release": "pnpm build && changeset publish"`
`.changeset/config.json`: `{ "$schema": "https://unpkg.com/@changesets/config/schema.json", "changelog": false, "commit": false, "access": "public", "baseBranch": "main", "updateInternalDependencies": "patch", "ignore": [] }`
ไม่สร้าง changeset file สำหรับ release แรก — `0.1.0` อยู่ใน package.json แล้ว

- [ ] **Step 2: เขียน workflows**

`ci.yml` — on `push` (main) + `pull_request`; job `check` matrix `node: [22, 24, 26]`; steps: `actions/checkout@v6` → `pnpm/action-setup@v6` (ไม่ระบุ version; อ่าน `packageManager`) → `actions/setup-node` (`node-version: ${{ matrix.node }}`, `cache: pnpm`) → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` (env `CI=true` ทำให้ publint/attw/failOnWarn ทำงาน)

`release.yml` — on `push` main; `permissions: { contents: write, pull-requests: write, id-token: write }`; concurrency `release`; steps: checkout → pnpm setup → setup-node 24 (`registry-url: https://registry.npmjs.org`) → install → `changesets/action` with `publish: pnpm release`; ไม่มี `NPM_TOKEN` (ใช้ trusted publishing); `GITHUB_TOKEN` สำหรับ Version PR

- [ ] **Step 3: ตรวจแพ็กเกจแบบเดียวกับ CI**

Run: `CI=true pnpm build && pnpm pack --dry-run`
Expected: build ผ่านโดย publint/attw ไม่มี error; รายการไฟล์ใน pack มีแค่ `dist/**`, `package.json`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md` (ไม่มี `src/`, `test/`, `docs/`)

Run: `grep -rn "@line/bot-sdk\|axios" dist/ ; node -e "import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(',')))"`
Expected: grep ไม่เจอ; รายการ export มี `LineBizClient`, `LineBizError`, `LineBizErrorCode`, `isLineBizError`, `MemoryCookieStore`, `APIError`, `AuthenticationError`, `ConfigError`, `ConnectionError`, `TimeoutError`, `AbortError`, `ValidationError`, `UnexpectedResponseError`, `PermissionDeniedError`, `NotFoundError`, `RateLimitError`, `InternalServerError`, `Page`, `PagePromise`

Run: `git grep -nE "__Host-chat-ses=|\"ses\",\"value\":\"[A-Za-z0-9]" -- . ':!docs'`
Expected: ไม่เจออะไร (ไม่มี credential ใน working tree)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: add CI matrix, changesets release with npm trusted publishing"
```

- [ ] **Step 5: รายงานผู้ใช้** — สรุปผล `pnpm check`, ไฟล์ใน `pnpm pack --dry-run`, และรายการงาน rollout ที่ผู้ใช้ต้องทำเอง (spec §15 ขั้น 0, 2, 3, 4): revoke session + `git filter-repo --path src/test.test.ts --invert-paths` + force-push, rename repo, ตั้ง npm Trusted Publisher สำหรับ `@prakrit_m/linebiz` → `PrakritManStudio/linebiz` workflow `release.yml`, publish, `npm deprecate @prakrit_m/lineweb "Moved to @prakrit_m/linebiz"`, แล้วงาน live verification ด้วย browser
