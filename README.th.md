[English](./README.md) | ภาษาไทย

# @prakrit_m/linebiz

TypeScript client แบบ unofficial สำหรับ web API ของ LINE Official Account (LINE OA) บน `chat.line.biz` ยืนยันตัวตนด้วย session cookie จากเบราว์เซอร์ ไม่มี runtime dependency, เป็น ESM-only และมี type ครบ

## ข้อควรทราบ (Disclaimer)

- โปรเจกต์นี้เป็น **unofficial** และ **ไม่มีส่วนเกี่ยวข้องหรือได้รับการรับรองจาก LY Corporation / LINE**
- ใช้ **web API ภายในที่ไม่มีเอกสารอย่างเป็นทางการ** ซึ่งแกะมาจากเว็บแอป LINE OA จึงอาจเปลี่ยนแปลงหรือใช้งานไม่ได้เมื่อใดก็ได้โดยไม่แจ้งล่วงหน้า
- การใช้งานอาจขัดกับข้อกำหนดการใช้บริการ (ToS) ของ LINE ผู้ใช้เป็นผู้รับผิดชอบการใช้งานของตนเองทั้งหมด
- session cookie คือข้อมูลยืนยันตัวตน **ห้าม commit cookie** (หรือไฟล์ที่มี cookie) เข้า repository และห้ามวางใน issue หรือ log

## การติดตั้ง

```sh
pnpm add @prakrit_m/linebiz
# หรือ: npm install @prakrit_m/linebiz
```

ต้องใช้ Node.js >= 22 แพ็กเกจนี้เป็น **ESM-only**:

```ts
import { LineBizClient } from "@prakrit_m/linebiz";
```

จาก CommonJS สามารถใช้ `require("@prakrit_m/linebiz")` ได้บน Node.js >= 22.12 (ที่เปิดใช้ `require(esm)` เป็นค่าเริ่มต้น) ส่วน Node.js 22.0 ถึง 22.11 ให้ใช้ `import()` แบบ dynamic แทน

import type ได้จาก root และจาก subpath `@prakrit_m/linebiz/types`

## เริ่มต้นใช้งานอย่างรวดเร็ว

```ts
import { LineBizClient } from "@prakrit_m/linebiz";

const cookies = process.env.LINEBIZ_COOKIES;
if (!cookies) throw new Error("Set LINEBIZ_COOKIES to your chat.line.biz session cookies");

const client = new LineBizClient({ cookies });

const me = await client.me.retrieve();
console.log(me.name);

// await รายการ จะได้หน้าแรก ...
const firstPage = await client.bots.list({ limit: 10 });
console.log(firstPage.data.map((bot) => bot.name));

// ... ส่วน for await จะวนทุก item ข้ามทุกหน้า
for await (const bot of client.bots.list()) {
  console.log(bot.botId, bot.name);
}
```

ทุกเมธอดคืน Promise ที่ reject เมื่อผิดพลาด ไม่ throw แบบ sync (ยกเว้น constructor: option ที่ไม่ถูกต้องจะ throw `ConfigError`)

## Cookies

ต้องใช้ cookie ของ session ที่ล็อกอิน `chat.line.biz` อยู่ในเบราว์เซอร์ ส่งผ่าน option `cookies` ได้ 3 รูปแบบ:

```ts
// ค่า name/value ด้านล่างเป็นเพียงตัวอย่าง

// 1. Cookie header string (ถือเป็น domain .line.biz, path /)
new LineBizClient({ cookies: "name1=value1; name2=value2" });

// 2. array ของ cookie object เช่นจาก context.cookies() ของ Playwright,
//    page.cookies() ของ Puppeteer หรือไฟล์ export จาก Cookie-Editor
new LineBizClient({
  cookies: [
    { name: "name1", value: "value1", domain: ".line.biz", path: "/", secure: true },
    { name: "name2", value: "value2", domain: "chat.line.biz", path: "/" },
  ],
});

// 3. JSON string ของ array ข้างต้น
new LineBizClient({ cookies: await readFile("cookies.json", "utf8") });
```

string ที่ขึ้นต้นด้วย `[` จะถูก parse เป็น JSON ส่วน string อื่นถือเป็น Cookie header SDK เก็บเฉพาะ cookie ของ `line.biz` (หรือ `*.line.biz`) และตัด cookie ที่หมดอายุออก ถ้ารูปแบบผิดจะ throw `ConfigError` ที่มี code `INVALID_COOKIE` โดยบอกตำแหน่งที่ผิด (ไม่มีชื่อหรือค่าของ cookie ในข้อความ) cookie จะถูกส่งเฉพาะ domain, path และ scheme ที่ตรงกันเท่านั้น

response อาจหมุนเวียน session ผ่าน `Set-Cookie` ซึ่ง `MemoryCookieStore` ที่มาพร้อม SDK จะอัปเดตให้เอง หากต้องการบันทึก session ปัจจุบัน:

```ts
const cookies = await client.exportCookies(); // CookieObject[]
```

`exportCookies()` ใช้ได้เฉพาะกับ store ที่มาพร้อม SDK; ถ้าใช้ `cookieStore` เอง จะ reject ด้วย `ConfigError`

### `CookieStore` แบบกำหนดเอง

ส่ง `cookieStore` แทน `cookies` เพื่อเก็บ session ไว้ที่อื่น store ต้องมี interface ดังนี้:

```ts
interface CookieStore {
  getCookieHeader(url: URL): string | Promise<string>;
  setCookies?(url: URL, setCookie: string[]): void | Promise<void>;
}
```

โค้ดด้านล่างเป็น **ตัวอย่างร่างเท่านั้น** (store ที่เก็บใน Redis; ออบเจ็กต์ `redis` เป็นตัวแทนของ client ที่คุณใช้ และ SDK ไม่ได้ depend กับมัน) ใช้ `MemoryCookieStore` ช่วยจับคู่ cookie ตามกฎ แล้วบันทึกลง Redis ทุกครั้งที่มีการอัปเดต:

```ts
import { LineBizClient, MemoryCookieStore } from "@prakrit_m/linebiz";
import type { CookieStore } from "@prakrit_m/linebiz";

// โครงสร้างขั้นต่ำของ Redis client ที่ใช้ (ตัวอย่างเท่านั้น)
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

  /** โหลด session ที่บันทึกไว้จาก Redis ถ้ายังไม่มีให้ใช้ `seed` */
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

ต้องระบุ `cookies` หรือ `cookieStore` อย่างใดอย่างหนึ่งเท่านั้น

## Client options

ทุก option เป็น optional ยกเว้นต้องมี `cookies` หรือ `cookieStore` อย่างใดอย่างหนึ่ง

| Option          | Type                               | ค่าเริ่มต้น                               | คำอธิบาย                                                                                                   |
| --------------- | ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `cookies`       | `string \| CookieObject[]`         | -                                         | session cookie (header string, JSON string หรือ cookie object) ใช้ร่วมกับ `cookieStore` ไม่ได้             |
| `cookieStore`   | `CookieStore`                      | -                                         | ที่เก็บ cookie แบบกำหนดเอง ใช้ร่วมกับ `cookies` ไม่ได้                                                     |
| `baseURLs`      | `Partial<Record<Service, string>>` | chat/manager/account `https://*.line.biz` | เปลี่ยน base URL ของ service (`"chat"`, `"manager"`, `"account"`) เช่นชี้ไป mock server ต้องเป็น http(s)   |
| `fetch`         | `typeof fetch`                     | `globalThis.fetch`                        | ใช้ `fetch` แบบกำหนดเอง                                                                                    |
| `headers`       | `Record<string, string>`           | `{}`                                      | header เพิ่มเติมทุก request (override ค่าเริ่มต้นได้)                                                      |
| `userAgent`     | `string`                           | Chrome user agent ปัจจุบัน                | header `User-Agent`                                                                                        |
| `clientVersion` | `string`                           | `"20240513144702"`                        | ค่า header `x-oa-chat-client-version` (ส่งให้ service `chat`)                                              |
| `timeout`       | `number`                           | `30000`                                   | timeout ของ request หน่วย ms (จำนวนเต็มบวก) นับต่อหนึ่งครั้งที่ลองส่ง                                      |
| `maxRetries`    | `number`                           | `2`                                       | จำนวนครั้งที่ retry request **GET** ที่ล้มเหลว (จำนวนเต็ม 0-10) ดูด้านล่าง                                 |
| `validate`      | `boolean`                          | `true`                                    | ตรวจ argument ฝั่ง client; `false` ข้ามเฉพาะการตรวจรูปแบบ ช่วงค่า และ enum (การตรวจชนิดข้อมูลยังทำงานเสมอ) |
| `hooks`         | `Hooks`                            | `{}`                                      | callback `onRequest` / `onResponse` / `onError` ดู [Hooks](#hooks)                                         |

option ที่ไม่ถูกต้องจะ throw `ConfigError` (code `INVALID_OPTIONS`) จาก constructor

**Option ต่อการเรียก** พารามิเตอร์ตัวสุดท้ายของทุกเมธอดคือ `RequestOptions` (optional):

```ts
interface RequestOptions {
  signal?: AbortSignal; // ยกเลิกการเรียก
  timeout?: number; // override timeout ของ client (ms)
  headers?: Record<string, string>; // override/เพิ่ม header เฉพาะการเรียกนี้
}

const controller = new AbortController();
await client.bots.retrieve(botId, { signal: controller.signal, timeout: 5_000 });
```

สำหรับเมธอดที่แบ่งหน้า option เหล่านี้ใช้กับทุก request ของแต่ละหน้า ลำดับความสำคัญของ header: ค่าเริ่มต้นของ SDK < `headers` ของ client < `headers` ต่อการเรียก

**Retry** retry เฉพาะ request `GET` และเฉพาะเมื่อเกิด network error, timeout หรือ HTTP 408 / 429 / 5xx ระยะหน่วงเป็น exponential backoff (`min(0.5s * 2^attempt, 8s)` บวก/ลบ jitter 25%) และเคารพ header `Retry-After` (วินาทีหรือ HTTP date, สูงสุด 60 วินาที) การยกเลิกด้วย `AbortSignal` ของคุณจะไม่ถูก retry และ request `POST` (เช่น `auth.logout()`) จะไม่ถูก retry เลย

**Client ที่ derive จากตัวเดิม** `client.withOptions({ ... })` คืน client ใหม่ที่เปลี่ยนบาง option (เปลี่ยนได้ทุกอย่างยกเว้น `cookies` / `cookieStore`) ตัวเดิมไม่ถูกแก้ไข และใช้ cookie store ร่วมกัน การ merge เป็นแบบ **shallow**: ถ้าส่งออบเจ็กต์ `headers`, `baseURLs` หรือ `hooks` มา ออบเจ็กต์นั้นจะ **แทนที่** ของเดิมทั้งก้อน ไม่ได้ merge เข้าด้วยกัน

```ts
const fast = client.withOptions({ timeout: 5_000, maxRetries: 0 });
```

## Pagination

เมธอด list ที่แบ่งหน้า (`bots.list`, `chats.list`, `messages.list`, `contacts.list`, `members.list`) คืน `PagePromise<T>` ซึ่งใช้ได้ 4 แบบ:

```ts
// 1. await: ได้หน้าแรก
const page = await client.chats.list(botId, { limit: 25 });
console.log(page.data.length, page.hasNextPage(), page.nextCursor);

// เดินทีละหน้าเอง (getNextPage() จะ reject ถ้าไม่มีหน้าถัดไป)
if (page.hasNextPage()) {
  const second = await page.getNextPage();
}

// 2. for await: ทุก item ดึงหน้าถัดไปเมื่อจำเป็น ใช้ break เพื่อหยุดกลางทาง
for await (const chat of client.chats.list(botId)) {
  if (chat.done) continue;
  console.log(chat.chatId);
}

// 3. toArray: รวม item เป็น array พร้อมกำหนดเพดานได้
const firstHundred = await client.contacts.list(botId).toArray({ maxItems: 100 });
const twoPages = await client.chats.list(botId).toArray({ maxPages: 2 });

// 4. cursor: เริ่มต่อจาก cursor ที่บันทึกไว้
if (page.nextCursor !== undefined) {
  const resumed = await client.chats.list(botId, { cursor: page.nextCursor });
}
```

`Page<T>` มี `data: T[]`, `nextCursor: string | undefined`, `raw` (response body ดั้งเดิม), `hasNextPage()` และ `getNextPage()` ดึงหน้าทีละหน้าตามลำดับ สำหรับ `messages.list` cursor คือ cursor แบบ `backward` และหน้าถัดไปจะย้อนเวลาไปเรื่อย ๆ หาก server คืน cursor ที่ไม่เดินหน้า การเรียกจะ reject ด้วย `UnexpectedResponseError` แทนการวนไม่รู้จบ

## Errors

ทุก error สืบทอดจาก `LineBizError` และมี `code` ที่เครื่องอ่านได้ (ค่าคงที่ `LineBizErrorCode`) ใช้ `isLineBizError(e)` เพื่อแคบ type จาก `unknown`

| Class                     | `code`                                                    | เกิดเมื่อ                                                                                                                     |
| ------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ConfigError`             | `INVALID_OPTIONS`, `INVALID_COOKIE`                       | option หรือ cookie ไม่ถูกต้อง; รวมถึงเรียก `exportCookies()` กับ store แบบกำหนดเอง                                            |
| `ValidationError`         | `INVALID_PARAMETER`                                       | argument ของเมธอดไม่ถูกต้อง; มี `.param`, `.value`, `.reason`                                                                 |
| `ConnectionError`         | `CONNECTION_ERROR`                                        | เครือข่ายล้มเหลว                                                                                                              |
| `TimeoutError`            | `TIMEOUT`                                                 | request เกิน timeout (สืบทอดจาก `ConnectionError`)                                                                            |
| `AbortError`              | `ABORTED`                                                 | ถูกยกเลิกด้วย `AbortSignal` ของคุณ                                                                                            |
| `UnexpectedResponseError` | `UNEXPECTED_RESPONSE`                                     | response ที่อ่านไม่ได้หรือไม่คาดคิด (JSON ผิด, redirect, ไม่มี `list`, ไม่มีหน้าถัดไป); อาจมี `.status`, `.body`, `.location` |
| `APIError`                | `API_ERROR`                                               | status ที่ไม่ใช่ 2xx อื่น ๆ; มี `.status`, `.body`, `.headers`, `.method`, `.url`                                             |
| `AuthenticationError`     | `SESSION_EXPIRED` (body code `not_login`), `UNAUTHORIZED` | HTTP 401 (สืบทอดจาก `APIError`)                                                                                               |
| `PermissionDeniedError`   | `PERMISSION_DENIED`                                       | HTTP 403 (สืบทอดจาก `APIError`)                                                                                               |
| `NotFoundError`           | `NOT_FOUND`                                               | HTTP 404 (สืบทอดจาก `APIError`)                                                                                               |
| `RateLimitError`          | `RATE_LIMITED`                                            | HTTP 429 (สืบทอดจาก `APIError`); `.retryAfter` หน่วย ms หรือ `undefined`                                                      |
| `InternalServerError`     | `SERVER_ERROR`                                            | HTTP 5xx (สืบทอดจาก `APIError`)                                                                                               |

`APIError.body` เป็น JSON ที่ parse แล้วถ้าทำได้ มิฉะนั้นเป็นข้อความ response ที่ตัดไว้ไม่เกิน 2,000 ตัวอักษร cookie จะไม่ปรากฏใน message หรือ field ของ error: header `cookie` และ `set-cookie` ถูกแทนด้วย `"[REDACTED]"`

```ts
import { AuthenticationError, LineBizErrorCode, isLineBizError } from "@prakrit_m/linebiz";

try {
  await client.me.retrieve();
} catch (error) {
  if (error instanceof AuthenticationError && error.code === LineBizErrorCode.SESSION_EXPIRED) {
    // cookie หมดอายุ: ล็อกอินใหม่แล้วสร้าง client ใหม่
  } else if (isLineBizError(error)) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

## Hooks

Hooks ไว้ทำ logging และ metrics context ของ hook ไม่มีค่า cookie (`cookie` / `set-cookie` ถูก redact)

```ts
const client = new LineBizClient({
  cookies, // ดู เริ่มต้นใช้งานอย่างรวดเร็ว
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

- `onRequest` ทำงานก่อนส่งทุกครั้ง (รวมครั้งที่ retry); ถ้า throw การเรียกจะ reject ด้วย error นั้น
- `onResponse` ทำงานทุกครั้งที่ได้รับ response ไม่ว่า status ใด
- `onError` ทำงานหนึ่งครั้งพร้อม error สุดท้ายเมื่อการเรียกล้มเหลว
- error ที่ throw จาก `onResponse` และ `onError` จะถูกละเลย

## Resources

endpoint ทั้งหมดในปัจจุบันอยู่บน service `chat` (`chat.line.biz`) เมธอดที่แบ่งหน้าคืน `PagePromise` (ดู [Pagination](#pagination)) ID (`botId`, `chatId`, user ID) เป็น string ตัวอักษร/ตัวเลข 33 ตัว

| เมธอด                                                                             | คืนค่า                      | หมายเหตุ                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `me.retrieve()`                                                                   | `Promise<Me>`               | ผู้ใช้ที่ล็อกอินอยู่                                                                                                                                                                                               |
| `bots.list({ limit?, cursor? })`                                                  | `PagePromise<Bot>`          | `limit` 1-1000 (ค่าเริ่มต้น 1000)                                                                                                                                                                                  |
| `bots.retrieve(botId)`                                                            | `Promise<BotDetail>`        |                                                                                                                                                                                                                    |
| `owners.list(botId, { bizIds? })`                                                 | `Promise<Owner[]>`          | `bizIds`: รายการ UUID                                                                                                                                                                                              |
| `tags.list(botId, { tagIds? })`                                                   | `Promise<Tag[]>`            | `tagIds`: ตัวอักษร ตัวเลข `-` `_`                                                                                                                                                                                  |
| `chats.list(botId, { limit?, tagIds?, folderType?, prioritizePinned?, cursor? })` | `PagePromise<Chat>`         | `limit` 1-25 (ค่าเริ่มต้น 25); `folderType` เริ่มต้น `"ALL"`; `prioritizePinned` เริ่มต้น `true`                                                                                                                   |
| `messages.list(botId, chatId, { cursor? })`                                       | `PagePromise<MessageEvent>` | ใหม่สุดก่อน; cursor ย้อนเวลา                                                                                                                                                                                       |
| `messages.retrieveFlex(botId, chatId, messageId, { timestamp? })`                 | `Promise<FlexContainer>`    | `messageId` / `timestamp`: string ที่เป็นตัวเลขล้วน                                                                                                                                                                |
| `contacts.list(botId, { query?, filter?, sortBy?, order?, limit?, cursor? })`     | `PagePromise<Contact>`      | `limit` 1-100 (เริ่มต้น 20); `filter` `ALL \| FRIEND \| NOT_FRIEND \| GROUP \| SPAM` (เริ่มต้น `ALL`); `sortBy` `DISPLAY_NAME \| LAST_TALKED_AT` (เริ่มต้น `DISPLAY_NAME`); `order` `ASC \| DESC` (เริ่มต้น `ASC`) |
| `members.list(botId, chatId, { userIds?, limit?, cursor? })`                      | `PagePromise<Member>`       | `limit` 1-100 (ค่าเริ่มต้น 100)                                                                                                                                                                                    |
| `auth.logout()`                                                                   | `Promise<void>`             | ออกจากระบบ web session; URL ล็อกเอาต์ต้องเป็น https `*.line.biz` / `*.line.me`                                                                                                                                     |

ทุกเมธอดรับ `RequestOptions` เป็นพารามิเตอร์ตัวสุดท้ายด้วย เช่น `client.tags.list(botId, {}, { signal })`

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

หมายเหตุ: `me.retrieve()` คืน field `localStorageEncryptionKey` ให้ถือว่า response นี้เป็นข้อมูลอ่อนไหวและอย่าบันทึกลง log

## Integration tests

repository มีชุดทดสอบแบบ read-only ที่เรียกบริการจริง โดยจะถูกข้ามหากไม่ได้ตั้งค่าผ่าน environment variable:

| ตัวแปร            | จำเป็น | คำอธิบาย                                                      |
| ----------------- | ------ | ------------------------------------------------------------- |
| `LINEBIZ_COOKIES` | ใช่    | session cookie (รูปแบบใดก็ได้ที่รองรับ)                       |
| `LINEBIZ_BOT_ID`  | ไม่    | Bot ID เปิดใช้เทสต์ที่ต้องใช้ bot (`chats.list`, `tags.list`) |

```sh
LINEBIZ_COOKIES='name1=value1; name2=value2' LINEBIZ_BOT_ID=<your bot id> pnpm test:integration
```

หากไม่มี `LINEBIZ_COOKIES` ทุกเทสต์จะถูกข้ามและคำสั่งจบด้วย exit code 0 ชุดทดสอบนี้ไม่เรียก `auth.logout()` ห้าม commit cookie; ไฟล์ `.env*` ถูก git ignore ไว้แล้ว

## License

[ISC](./LICENSE) ส่วน type definition ที่ inline มาจาก `@line/bot-sdk` ในไฟล์ `.d.ts` ที่เผยแพร่ใช้สัญญาอนุญาต Apache-2.0 ดู [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
