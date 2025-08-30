export interface BotData {
  botId: string;
  basicSearchId: string;
  name: string;
  iconUrl: string;
  iconHash: string;
  region: string;
  brandType: string;
  userPermissionType: string;
  responseMode: string;
  disabledCrm: boolean;
  unreadCount: number;
  plan: {
    code: string;
    planType: string;
  };
  offline: boolean;
}

export type BotsList = {
  list: BotData[];
  next?: string;
};

export interface Bot extends BotData {
  hasChatRoom: boolean;
}
