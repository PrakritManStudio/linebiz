import { beforeAll, describe, expect, it } from "vitest";
import { LineBizClient } from "../../src/client.js";

// Live, read-only checks against chat.line.biz. Skipped unless LINEBIZ_COOKIES is set.
// This suite must never call auth.logout() or any other state-changing method.
const cookies = process.env.LINEBIZ_COOKIES;
const botId = process.env.LINEBIZ_BOT_ID;

describe.skipIf(!cookies)("live read-only", () => {
  let client: LineBizClient;

  beforeAll(() => {
    client = new LineBizClient({ cookies: cookies ?? "" });
  });

  it("me.retrieve", async () => {
    const me = await client.me.retrieve();
    expect(typeof me.bizId).toBe("string");
  });

  it("bots.list first page", async () => {
    const page = await client.bots.list({ limit: 5 });
    expect(Array.isArray(page.data)).toBe(true);
  });

  it.skipIf(!botId)("chats.list first page", async () => {
    const page = await client.chats.list(botId ?? "", { limit: 5 });
    expect(Array.isArray(page.data)).toBe(true);
  });

  it.skipIf(!botId)("tags.list", async () => {
    const tags = await client.tags.list(botId ?? "");
    expect(Array.isArray(tags)).toBe(true);
  });
});
