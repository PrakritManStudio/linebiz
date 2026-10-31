import { LineBizClient } from "../../src/client.js";

/** Valid fake IDs (33 alphanumeric characters) used by resource tests. */
export const BOT: string = "U" + "0".repeat(32);
export const CHAT: string = "C" + "1".repeat(32);
export const USER: string = "U" + "2".repeat(32);

/** Create a client wired to a mock `fetch`, with a `a=1` cookie and no retries. */
export function client(m: { fetch: typeof globalThis.fetch }): LineBizClient {
  return new LineBizClient({ cookies: "a=1", fetch: m.fetch, maxRetries: 0 });
}
