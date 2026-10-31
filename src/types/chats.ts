/** Profile of the chat partner (user or group). */
export interface ChatProfile {
  groupId: string;
  name: string;
  count: number;
  iconHash: string;
}

/** Origin of a chat event. */
export interface MessageSource {
  chatId: string;
  userId: string;
}

/** The latest event of a chat. */
export interface ChatEvent {
  type: string;
  timestamp: number;
  source: MessageSource;
  message: unknown;
}

/** A chat room in the OA inbox. */
export interface Chat {
  chatId: string;
  updatedAt: number;
  tagIds: string[];
  autoTagIds: string[];
  read: boolean;
  readMentioned: boolean;
  done: boolean;
  followedUp: boolean;
  spam: boolean;
  muteAtPc: boolean;
  muteAtApp: boolean;
  assignedBizId: string;
  profile: ChatProfile;
  latestEvent: ChatEvent;
  lastReadAt: number;
  lastReceivedAt: number;
  lastSentAt: number;
  lastTalkedAt: number;
  lastReadMessageId: string;
  chatType: "GROUP" | "USER" | "ROOM";
  status: "active" | "blocked";
}
