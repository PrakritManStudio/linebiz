import { describe, expect, expectTypeOf, it } from "vitest";
import { LineBizClient } from "../../src/client.js";
import {
  InternalServerError,
  UnexpectedResponseError,
  ValidationError,
} from "../../src/core/errors.js";
import type { ChatReadEvent, MessageEvent } from "../../src/types/index.js";
import { chatsPageFixture } from "../fixtures/chats.js";
import { contactsPageFixture } from "../fixtures/contacts.js";
import { flexFixture } from "../fixtures/flex.js";
import { membersPageFixture } from "../fixtures/members.js";
import { messagesPageFixture } from "../fixtures/messages.js";
import { BOT, CHAT, USER, client } from "../helpers/client.js";
import { json, mockFetch } from "../helpers/mock-fetch.js";

const csrfToken = (): Response =>
  json({ headerName: "X-XSRF-TOKEN", parameterName: "_csrf", token: "tok" });

describe("chats / messages / contacts / members / auth", () => {
  it("chats.list query shape", async () => {
    const m = mockFetch(json(chatsPageFixture));
    await client(m).chats.list(BOT, { tagIds: ["t1"] });
    const q = new URL(m.calls[0]!.url).searchParams;
    expect(m.calls[0]!.url).toContain(`/api/v2/bots/${BOT}/chats?`);
    expect(Object.fromEntries(q)).toEqual({
      folderType: "ALL",
      tagIds: "t1",
      autoTagIds: "",
      limit: "25",
      prioritizePinnedChat: "true",
    });
  });

  it("chats.list defaults send empty tagIds and honour overrides", async () => {
    const m = mockFetch(json(chatsPageFixture), json(chatsPageFixture));
    await client(m).chats.list(BOT);
    expect(new URL(m.calls[0]!.url).searchParams.get("tagIds")).toBe("");
    await client(m).chats.list(BOT, {
      folderType: "UNREAD",
      prioritizePinned: false,
      limit: 5,
      tagIds: ["ab", "cd"],
    });
    expect(Object.fromEntries(new URL(m.calls[1]!.url).searchParams)).toEqual({
      folderType: "UNREAD",
      tagIds: "ab,cd",
      autoTagIds: "",
      limit: "5",
      prioritizePinnedChat: "false",
    });
  });

  it("chats.list pages with next cursor", async () => {
    const m = mockFetch(json({ ...chatsPageFixture, next: "N1" }), json({ list: [] }));
    const all = await client(m).chats.list(BOT).toArray();
    expect(new URL(m.calls[1]!.url).searchParams.get("next")).toBe("N1");
    expect(all).toHaveLength(chatsPageFixture.list.length);
  });

  it("chats.list limit range", async () => {
    await expect(client(mockFetch()).chats.list(BOT, { limit: 26 })).rejects.toThrow(
      /between 1 and 25/,
    );
  });

  it("chats.list validates botId and tagIds", async () => {
    await expect(client(mockFetch()).chats.list("bad")).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client(mockFetch()).chats.list(BOT, { tagIds: ["bad id"] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("messages.list uses backward cursor", async () => {
    const m = mockFetch(json({ ...messagesPageFixture, backward: "B1" }), json({ list: [] }));
    const all = await client(m).messages.list(BOT, CHAT).toArray();
    expect(m.calls[0]!.url).toContain(`/api/v3/bots/${BOT}/chats/${CHAT}/messages`);
    expect(new URL(m.calls[1]!.url).searchParams.get("backward")).toBe("B1");
    expect(all).toHaveLength(messagesPageFixture.list.length);
  });

  it("messages.list resume", async () => {
    const m = mockFetch(json({ list: [] }));
    await client(m).messages.list(BOT, CHAT, { cursor: "B9" });
    expect(new URL(m.calls[0]!.url).searchParams.get("backward")).toBe("B9");
  });

  it("messages.list validates chatId", async () => {
    await expect(client(mockFetch()).messages.list(BOT, "x")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("retrieveFlex", async () => {
    const m = mockFetch(json(flexFixture));
    expect(
      await client(m).messages.retrieveFlex(BOT, CHAT, "123", { timestamp: "1700000000000" }),
    ).toEqual(flexFixture);
    expect(m.calls[0]!.url).toContain(`/api/v1/bots/${BOT}/chats/${CHAT}/messages/flexJson?`);
    expect(Object.fromEntries(new URL(m.calls[0]!.url).searchParams)).toEqual({
      messageId: "123",
      timestamp: "1700000000000",
    });
    await expect(
      client(mockFetch()).messages.retrieveFlex(BOT, CHAT, "12a"),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client(mockFetch()).messages.retrieveFlex(BOT, CHAT, "1", { timestamp: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("retrieveFlex omits timestamp when not given", async () => {
    const m = mockFetch(json(flexFixture));
    await client(m).messages.retrieveFlex(BOT, CHAT, "123");
    expect(Object.fromEntries(new URL(m.calls[0]!.url).searchParams)).toEqual({ messageId: "123" });
  });

  // regression: old getContactByName never sent `next`
  it("contacts.list sends next cursor on page 2", async () => {
    const m = mockFetch(json({ ...contactsPageFixture, next: "N2" }), json({ list: [] }));
    await client(m).contacts.list(BOT, { query: "สมชาย & co" }).toArray();
    const q1 = new URL(m.calls[0]!.url).searchParams;
    expect(q1.get("query")).toBe("สมชาย & co");
    expect(q1.get("limit")).toBe("20");
    expect(q1.get("filterKey")).toBe("ALL");
    expect(q1.get("sortKey")).toBe("DISPLAY_NAME");
    expect(q1.get("sortOrder")).toBe("ASC");
    expect(new URL(m.calls[1]!.url).searchParams.get("next")).toBe("N2");
  });

  it("contacts.list sends empty query by default and honours overrides", async () => {
    const m = mockFetch(json(contactsPageFixture), json(contactsPageFixture));
    await client(m).contacts.list(BOT);
    expect(new URL(m.calls[0]!.url).search).toContain("query=&");
    await client(m).contacts.list(BOT, {
      filter: "FRIEND",
      sortBy: "LAST_TALKED_AT",
      order: "DESC",
      limit: 100,
    });
    expect(Object.fromEntries(new URL(m.calls[1]!.url).searchParams)).toEqual({
      query: "",
      sortKey: "LAST_TALKED_AT",
      sortOrder: "DESC",
      filterKey: "FRIEND",
      limit: "100",
    });
  });

  it("contacts.list enum validation", async () => {
    await expect(
      client(mockFetch()).contacts.list(BOT, { filter: "friend" as never }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client(mockFetch()).contacts.list(BOT, { sortBy: "x" as never }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client(mockFetch()).contacts.list(BOT, { order: "up" as never }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(client(mockFetch()).contacts.list(BOT, { limit: 101 })).rejects.toThrow(
      /between 1 and 100/,
    );
  });

  it("members.list", async () => {
    const m = mockFetch(json(membersPageFixture));
    await client(m).members.list(BOT, CHAT, { userIds: [USER] });
    const q = new URL(m.calls[0]!.url).searchParams;
    expect(m.calls[0]!.url).toContain(`/api/v1/bots/${BOT}/chats/${CHAT}/members?`);
    expect(q.get("limit")).toBe("100");
    expect(q.get("userIds")).toBe(USER);
  });

  it("members.list omits userIds, validates them and pages", async () => {
    const m = mockFetch(json({ ...membersPageFixture, next: "M2" }), json({ list: [] }));
    await client(m).members.list(BOT, CHAT).toArray();
    expect(new URL(m.calls[0]!.url).searchParams.has("userIds")).toBe(false);
    expect(new URL(m.calls[1]!.url).searchParams.get("next")).toBe("M2");
    await expect(
      client(mockFetch()).members.list(BOT, CHAT, { userIds: ["bad"] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("message event types: originalType on text messages, optional userId on chatRead source", () => {
    expectTypeOf<ChatReadEvent["source"]>().toEqualTypeOf<{ chatId: string; userId?: string }>();
    const sent = messagesPageFixture.list.find(
      (e): e is Extract<MessageEvent, { type: "messageSent" }> => e.type === "messageSent",
    );
    expect(sent).toBeDefined();
    const flexSent = messagesPageFixture.list.some(
      (e) =>
        e.type === "messageSent" &&
        e.message.type === "text" &&
        e.message.originalType === "flex" &&
        e.sendId === undefined &&
        e.bizId === undefined,
    );
    expect(flexSent).toBe(true);
    const received: Extract<MessageEvent, { type: "message" }>["message"] = {
      id: "1",
      type: "text",
      text: "t",
      originalType: "flex",
    };
    expect(received.type).toBe("text");
  });

  it("members.list rejects user chats (U...) before any request", async () => {
    const m = mockFetch();
    const err: unknown = await client(m)
      .members.list(BOT, USER)
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({
      param: "chatId",
      reason: 'members.list only supports group or room chats (chat IDs starting with "C" or "R")',
    });
    expect(m.calls).toHaveLength(0);
  });

  it("members.list accepts room chats (R...) and sends U chats with validate:false", async () => {
    const room = "R" + "3".repeat(32);
    const m = mockFetch(json(membersPageFixture), json(membersPageFixture));
    await client(m).members.list(BOT, room);
    expect(m.calls[0]!.url).toContain(`/chats/${room}/members?`);
    const lenient = new LineBizClient({
      cookies: "a=1",
      fetch: m.fetch,
      maxRetries: 0,
      validate: false,
    });
    await lenient.members.list(BOT, USER);
    expect(m.calls[1]!.url).toContain(`/chats/${USER}/members?`);
  });

  it("retrieveFlex does not retry a 500", async () => {
    const m = mockFetch(json({}, { status: 500 }), json(flexFixture));
    const retrying = new LineBizClient({
      cookies: "a=1",
      fetch: m.fetch,
      maxRetries: 2,
    });
    await expect(retrying.messages.retrieveFlex(BOT, CHAT, "123")).rejects.toBeInstanceOf(
      InternalServerError,
    );
    expect(m.calls).toHaveLength(1);
  });

  it("auth.logout calls logoutUri on account host without following redirects", async () => {
    const m = mockFetch(
      json({ headerName: "X-XSRF-TOKEN", parameterName: "_csrf", token: "tok" }),
      json({ logoutUri: "https://account.line.biz/logout?x=1" }),
      new Response(null, { status: 302, headers: { location: "https://access.line.me/" } }),
    );
    await client(m).auth.logout();
    expect(m.calls).toHaveLength(3);
    expect(m.calls[0]!.method).toBe("GET");
    expect(m.calls[0]!.url).toContain("/api/v1/csrfToken");
    expect(m.calls[1]!.method).toBe("POST");
    expect(m.calls[1]!.url).toContain("/api/v1/logoutUri");
    expect(m.calls[1]!.headers.get("x-xsrf-token")).toBe("tok");
    expect(await m.calls[1]!.json()).toEqual({ redirectPath: "/" });
    expect(m.calls[2]!.method).toBe("GET");
    expect(m.calls[2]!.url).toBe("https://account.line.biz/logout?x=1");
    expect(m.calls[2]!.headers.has("x-xsrf-token")).toBe(false);
  });

  it("auth.logout refuses foreign logoutUri", async () => {
    const m = mockFetch(csrfToken(), json({ logoutUri: "https://evil.example/" }));
    await expect(client(m).auth.logout()).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(m.calls).toHaveLength(2);
  });

  it("auth.logout missing logoutUri", async () => {
    await expect(client(mockFetch(csrfToken(), json({}))).auth.logout()).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
