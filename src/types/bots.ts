/** A LINE Official Account (bot) as listed for the signed-in user. */
export interface Bot {
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

/** Detailed information about a single bot. */
export interface BotDetail extends Bot {
  hasChatRoom: boolean;
}
