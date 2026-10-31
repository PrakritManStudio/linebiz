/** Event emitted when a chat is marked as read. */
export interface ChatReadEvent {
  type: "chatRead";
  timestamp: number;
  source: {
    chatId: string;
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
        stickerResourceType: "STATIC" | "ANIMATION_SOUND";
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
        mention?: {
          mentionees: {
            index: number;
            length: number;
            userId: string;
            type: "user";
          }[];
        };
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
        mention?: {
          mentionees: {
            index: number;
            length: number;
            userId: string;
            type: "user";
          }[];
        };
        quotedMessageId?: string;
      }
    | {
        id: string;
        quoteToken?: string;
        packageId: string;
        stickerId: string;
        stickerResourceType: "ANIMATION_SOUND";
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
  left: {
    members: {
      userId: string;
    }[];
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
  | MemberJoinedEvent;
