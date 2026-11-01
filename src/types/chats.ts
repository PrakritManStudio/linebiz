import type { MessageEvent } from "./messages.js";

/** Profile of a user chat partner. */
export interface ChatUserProfile {
  /** LINE user ID of the partner. */
  userId: string;
  /** Display name. */
  name: string;
  /** Whether the user currently follows the account. */
  friend: boolean;
  /** Timestamp (ms) until which the chat remains active after the user's last activity. */
  lastActivityExpiresAt: number;
  /** Hash of the profile icon. */
  iconHash: string;
}

/** Profile of a group chat partner; `name` and `iconHash` are absent for some groups. */
export interface ChatGroupProfile {
  /** LINE group ID. */
  groupId: string;
  /** Number of members. */
  count: number;
  /** Group name, when it has one. */
  name?: string;
  /** Hash of the group icon, when it has one. */
  iconHash?: string;
}

/** Profile of the chat partner (user or group). */
export type ChatProfile = ChatUserProfile | ChatGroupProfile;

/** A chat room in the OA inbox. */
export interface Chat {
  chatId: string;
  updatedAt: number;
  tagIds: string[];
  autoTagIds: string[];
  read: boolean;
  readMentioned?: boolean;
  done: boolean;
  followedUp: boolean;
  spam: boolean;
  muteAtPc: boolean;
  muteAtApp: boolean;
  assignedBizId?: string;
  profile: ChatProfile;
  latestEvent?: MessageEvent;
  lastReadAt: number;
  lastReceivedAt: number;
  lastSentAt?: number;
  lastTalkedAt: number;
  lastReadMessageId: string;
  /** Timestamp (ms) of the partner's last read of the account's messages. */
  userLastReadAt?: number;
  /** ID of the last message the partner has read. */
  userLastReadMessageId?: string;
  chatType: "GROUP" | "USER" | "ROOM";
  status: "active" | "blocked";
}
