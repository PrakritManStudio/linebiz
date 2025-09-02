type ChatRead = {
  type: "chatRead";
  timestamp: number;
  source: {
    chatId: string;
  };
  read: {
    watermark: number;
  };
};

export type Message = {
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
};

type MessageSent = {
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
};

type Unsend = {
  type: "unsend";
  timestamp: number;
  source: {
    chatId: string;
  };
  unsend: {
    messageId: string;
  };
};

type Join = {
  type: "join";
  timestamp: number;
  source: {
    chatId: string;
  };
};

type Leave = {
  type: "leave";
  timestamp: number;
  source: {
    chatId: string;
  };
};

type MemberLeft = {
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
};

type MemberJoined = {
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
};

export type MessageEventType =
  | ChatRead
  | Message
  | MessageSent
  | Unsend
  | Join
  | Leave
  | MemberLeft
  | MemberJoined;

export type MessagesResponse = {
  list: MessageEventType[];
  backward?: string;
};
