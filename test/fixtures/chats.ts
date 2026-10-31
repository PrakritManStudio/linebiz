import type { Chat } from "../../src/types/index.js";
import { BIZ_ID, CHAT_ID, MESSAGE_ID, TAG_ID, USER_ID } from "./ids.js";

export const chatsPageFixture: { list: Chat[]; next?: string } = {
  list: [
    {
      chatId: CHAT_ID,
      updatedAt: 1700000000000,
      tagIds: [TAG_ID],
      autoTagIds: [],
      read: true,
      readMentioned: true,
      done: false,
      followedUp: false,
      spam: false,
      muteAtPc: false,
      muteAtApp: false,
      assignedBizId: BIZ_ID,
      profile: {
        groupId: CHAT_ID,
        name: "Fake Chat",
        count: 3,
        iconHash: "fakeiconhash",
      },
      latestEvent: {
        type: "message",
        timestamp: 1700000000000,
        source: { chatId: CHAT_ID, userId: USER_ID },
        message: { id: MESSAGE_ID, type: "text", text: "hello" },
      },
      lastReadAt: 1700000000000,
      lastReceivedAt: 1700000000000,
      lastSentAt: 1700000000000,
      lastTalkedAt: 1700000000000,
      lastReadMessageId: MESSAGE_ID,
      chatType: "USER",
      status: "active",
    },
  ],
  next: "fake-next-cursor",
};
