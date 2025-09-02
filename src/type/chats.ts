export interface ChatProfile {
  groupId: string;
  name: string;
  count: number;
  iconHash: string;
}

export interface MessageSource {
  chatId: string;
  userId: string;
}

export interface ChatEvent {
  type: string;
  timestamp: number;
  source: MessageSource;
  message: unknown;
}

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

export interface ChatsResponse {
  list: Chat[];
  next?: string;
}
