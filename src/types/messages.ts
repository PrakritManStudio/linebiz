/** Kind of resource behind a sticker; unknown values are passed through as strings. */
export type StickerResourceType =
  "STATIC" | "ANIMATION" | "SOUND" | "ANIMATION_SOUND" | (string & {});

/** A user, or everyone, mentioned in a text message. */
export type Mentionee =
  | {
      /** Start index of the mention in the text. */
      index: number;
      /** Length of the mention in the text. */
      length: number;
      /** The mention targets the account itself or everyone. */
      type: "self" | "all";
    }
  | {
      /** Start index of the mention in the text. */
      index: number;
      /** Length of the mention in the text. */
      length: number;
      /** The mention targets a specific user. */
      type: "user";
      /** LINE user ID of the mentioned user. */
      userId: string;
    };

/** Mentions contained in a text message. */
export interface Mention {
  /** Mentioned targets. */
  mentionees: Mentionee[];
}

/** Event emitted when a chat is marked as read. */
export interface ChatReadEvent {
  type: "chatRead";
  timestamp: number;
  source: {
    chatId: string;
    /** User ID; present in user chats, absent in group chats. */
    userId?: string;
  };
  read: {
    watermark: number;
  };
}

/** A message received from a user. */
export interface MessageReceivedEvent {
  type: "message";
  timestamp: number;
  source: {
    chatId: string;
    userId: string;
  };
  message:
    | {
        id: string;
        type: "location";
        latitude: number;
        longitude: number;
        address: string;
      }
    | {
        id: string;
        type: "audio";
        contentProvider: {
          type: "line";
          contentHash: string;
          expired: boolean;
          expiredAt: number;
        };
        duration: number;
        contentHash: string;
        expired: boolean;
        expiredAt: number;
      }
    | {
        id: string;
        type: "image";
        quoteToken?: string;
        contentProvider: {
          type: "line";
          contentHash: string;
          expired: boolean;
          expiredAt: number;
        };
        contentHash: string;
        expired: boolean;
        expiredAt: number;
      }
    | {
        id: string;
        type: "video";
        quoteToken?: string;
        contentProvider: {
          type: "line";
          contentHash: string;
          expired: boolean;
          expiredAt: number;
        };
        duration: number;
        contentHash: string;
        expired: boolean;
        expiredAt: number;
      }
    | {
        id: string;
        type: "unsent";
      }
    | {
        id: string;
        type: "file";
        contentProvider: {
          type: "line";
          contentHash: string;
          expired: boolean;
          expiredAt: number;
        };
        fileName: string;
        fileSize: number;
        contentHash: string;
        expired: boolean;
        expiredAt: number;
      }
    | {
        id: string;
        quotedMessageId?: string;
        quoteToken?: string;
        packageId: string;
        stickerId: string;
        stickerResourceType: StickerResourceType;
        type: "sticker";
      }
    | {
        id: string;
        type: "text";
        quotedMessageId?: string;
        quoteToken?: string;
        text: string;
        emojis?: {
          index: number;
          length: number;
          productId: string;
          emojiId: string;
        }[];
        mention?: Mention;
        /**
         * Type the message was originally sent as, e.g. `"flex"`: the message is shown as text
         * with its alt text, and the Flex container can be fetched with `messages.retrieveFlex`.
         */
        originalType?: string;
      };
}

/** A message sent from the OA to a user. */
export interface MessageSentEvent {
  type: "messageSent";
  timestamp: number;
  source: {
    chatId: string;
    userId: string;
  };
  message:
    | {
        id: string;
        type: "video";
        quoteToken?: string;
        contentProvider: {
          type: "external";
          originalContentUrl: string;
          previewImageUrl: string;
        };
        duration: number;
      }
    | {
        id: string;
        type: "image";
        quoteToken?: string;
        contentProvider: {
          type: "external";
          originalContentUrl: string;
          previewImageUrl: string;
        };
      }
    | {
        id: string;
        type: "text";
        quoteToken?: string;
        text: string;
        emojis?: {
          index: number;
          length: number;
          productId: string;
          emojiId: string;
        }[];
        mention?: Mention;
        quotedMessageId?: string;
        /**
         * Type the message was originally sent as, e.g. `"flex"`: the message is shown as text
         * with its alt text, and the Flex container can be fetched with `messages.retrieveFlex`.
         */
        originalType?: string;
      }
    | {
        id: string;
        quoteToken?: string;
        packageId: string;
        stickerId: string;
        stickerResourceType: StickerResourceType;
        type: "sticker";
      }
    | {
        id: string;
        type: "file";
        contentProvider: {
          type: "line";
          contentHash: string;
          expired: boolean;
          expiredAt: number;
        };
        fileName: string;
        fileSize: number;
        contentHash: string;
        expired: boolean;
        expiredAt: number;
      };
  sendId?: string;
  bizId?: string;
}

/** A message was unsent. */
export interface UnsendEvent {
  type: "unsend";
  timestamp: number;
  source: {
    chatId: string;
  };
  unsend: {
    messageId: string;
  };
}

/** The bot joined a group or room. */
export interface JoinEvent {
  type: "join";
  timestamp: number;
  source: {
    chatId: string;
  };
}

/** The bot left a group or room. */
export interface LeaveEvent {
  type: "leave";
  timestamp: number;
  source: {
    chatId: string;
  };
}

/** Members left a group. */
export interface MemberLeftEvent {
  type: "memberLeft";
  timestamp: number;
  source: {
    chatId: string;
  };
  left: {
    members: {
      userId: string;
    }[];
  };
}

/** Members joined a group. */
export interface MemberJoinedEvent {
  type: "memberJoined";
  timestamp: number;
  source: {
    chatId: string;
  };
  joined: {
    members: {
      userId: string;
    }[];
  };
}

/** A user followed (added) the account. */
export interface FollowEvent {
  type: "follow";
  timestamp: number;
  source: {
    chatId: string;
    userId: string;
  };
}

/** A user unfollowed (blocked or removed) the account. */
export interface UnfollowEvent {
  type: "unfollow";
  timestamp: number;
  source: {
    chatId: string;
    userId: string;
  };
}

/** Any event that can appear in a chat message history. */
export type MessageEvent =
  | ChatReadEvent
  | MessageReceivedEvent
  | MessageSentEvent
  | UnsendEvent
  | LeaveEvent
  | JoinEvent
  | MemberLeftEvent
  | MemberJoinedEvent
  | FollowEvent
  | UnfollowEvent;
