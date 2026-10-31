import type { MessageEvent } from "../../src/types/index.js";
import { BIZ_ID, CHAT_ID, MESSAGE_ID, USER_ID } from "./ids.js";

const timestamp = 1700000000000;
const source = { chatId: CHAT_ID, userId: USER_ID };

/** Contains at least one event for each variant of the MessageEvent union. */
export const messagesPageFixture: { list: MessageEvent[]; backward?: string } = {
  list: [
    {
      type: "chatRead",
      timestamp,
      source: { chatId: CHAT_ID },
      read: { watermark: timestamp },
    },
    {
      type: "message",
      timestamp,
      source,
      message: { id: MESSAGE_ID, type: "text", text: "hello" },
    },
    {
      type: "messageSent",
      timestamp,
      source,
      message: { id: MESSAGE_ID, type: "text", text: "hi there" },
      sendId: "fake-send-id",
      bizId: BIZ_ID,
    },
    {
      type: "unsend",
      timestamp,
      source: { chatId: CHAT_ID },
      unsend: { messageId: MESSAGE_ID },
    },
    { type: "join", timestamp, source: { chatId: CHAT_ID } },
    { type: "leave", timestamp, source: { chatId: CHAT_ID } },
    {
      type: "memberLeft",
      timestamp,
      source: { chatId: CHAT_ID },
      left: { members: [{ userId: USER_ID }] },
    },
    {
      type: "memberJoined",
      timestamp,
      source: { chatId: CHAT_ID },
      left: { members: [{ userId: USER_ID }] },
    },
  ],
  backward: "fake-backward-cursor",
};
