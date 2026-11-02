import { beforeAll, describe, expect, it } from "vitest";
import { LineBizClient } from "../../src/client.js";
import type { Chat, MessageEvent } from "../../src/types/index.js";

// Live, read-only checks against chat.line.biz. Skipped unless LINEBIZ_COOKIES is set.
// Values may come from the shell or from a git-ignored `.env` file (see `.env.example`).
// This suite must never call auth.logout() or any other state-changing method.
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to the shell environment.
}

const EVENT_TYPES = [
  "chatRead",
  "message",
  "messageSent",
  "unsend",
  "join",
  "leave",
  "memberJoined",
  "memberLeft",
  "follow",
  "unfollow",
] as const satisfies readonly MessageEvent["type"][];

// Compile-time check: every `MessageEvent` type literal must be listed in EVENT_TYPES.
const allEventTypesListed: Exclude<MessageEvent["type"], (typeof EVENT_TYPES)[number]> extends never
  ? true
  : never = true;

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

  describe.skipIf(!botId)("bot-scoped", () => {
    const bot = botId ?? "";
    let chats: Chat[] = [];

    beforeAll(async () => {
      chats = (await client.chats.list(bot, { limit: 25 })).data;
    });

    it("bots.retrieve", async () => {
      const detail = await client.bots.retrieve(bot);
      expect(detail.botId).toBe(bot);
    });

    it("chats.list first page", () => {
      expect(Array.isArray(chats)).toBe(true);
      for (const chat of chats) {
        const { profile } = chat;
        const id = "userId" in profile ? profile.userId : profile.groupId;
        expect(typeof id).toBe("string");
      }
    });

    it("tags.list", async () => {
      expect(Array.isArray(await client.tags.list(bot))).toBe(true);
    });

    it("owners.list", async () => {
      expect(Array.isArray(await client.owners.list(bot))).toBe(true);
    });

    it("contacts.list first page", async () => {
      const page = await client.contacts.list(bot, { limit: 5 });
      expect(Array.isArray(page.data)).toBe(true);
    });

    it("messages.list first page of the first chat", async (ctx) => {
      const chat = chats[0];
      if (!chat) return ctx.skip();
      const page = await client.messages.list(bot, chat.chatId);
      expect(Array.isArray(page.data)).toBe(true);
    });

    it("messages event types are known", async (ctx) => {
      const chat = chats[0];
      if (!chat) return ctx.skip();
      const page = await client.messages.list(bot, chat.chatId);
      expect(allEventTypesListed).toBe(true);
      const known: readonly string[] = EVENT_TYPES;
      const unknown = page.data.map((event) => event.type).filter((type) => !known.includes(type));
      expect(unknown).toEqual([]);
    });

    it("retrieveFlex for a Flex message in history", async (ctx) => {
      for (const chat of chats.slice(0, 10)) {
        const page = await client.messages.list(bot, chat.chatId);
        for (const event of page.data) {
          if (
            (event.type === "message" || event.type === "messageSent") &&
            event.message.type === "text" &&
            event.message.originalType === "flex"
          ) {
            const flex = await client.messages.retrieveFlex(bot, chat.chatId, event.message.id);
            expect(typeof flex).toBe("object");
            expect(["bubble", "carousel"]).toContain(flex.type);
            return;
          }
        }
      }
      return ctx.skip();
    });

    it("members.list of the first group/room chat", async (ctx) => {
      const chat = chats.find((c) => c.chatType === "GROUP" || c.chatType === "ROOM");
      if (!chat) return ctx.skip();
      const page = await client.members.list(bot, chat.chatId, { limit: 5 });
      expect(Array.isArray(page.data)).toBe(true);
    });
  });
});
