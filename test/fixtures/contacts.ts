import type { Contact } from "../../src/types/index.js";
import { BIZ_ID, CHAT_ID, TAG_ID, USER_ID } from "./ids.js";

export const contactsPageFixture: { list: Contact[]; next?: string } = {
  list: [
    {
      contactId: USER_ID,
      profile: {
        userId: USER_ID,
        name: "Fake User",
        friend: true,
        lastActivityExpiresAt: 1700000000000,
        iconHash: "fakeiconhash",
      },
      tagIds: [TAG_ID],
      autoTagIds: [],
      done: false,
      followedUp: false,
      spam: false,
      friend: true,
      useManualChat: false,
      chatAvailable: true,
      lastTalkedAt: 1700000000000,
      chatExists: true,
      assignedBizId: BIZ_ID,
    },
    {
      contactId: CHAT_ID,
      profile: {
        groupId: CHAT_ID,
        name: "Fake Group",
        count: 3,
        iconHash: "fakeiconhash",
      },
      tagIds: [],
      autoTagIds: [],
      done: false,
      followedUp: false,
      spam: false,
      useManualChat: false,
      chatAvailable: true,
      lastTalkedAt: 1700000000000,
      chatExists: true,
    },
  ],
  next: "fake-next-cursor",
};
