import type { Bot, BotDetail } from "../../src/types/index.js";
import { BOT_ID } from "./ids.js";

const bot: Bot = {
  botId: BOT_ID,
  basicSearchId: "@fake-oa",
  name: "Fake Official Account",
  iconUrl: "https://example.invalid/icon.png",
  iconHash: "fakeiconhash",
  region: "TH",
  brandType: "GENERAL",
  userPermissionType: "ADMIN",
  responseMode: "CHAT",
  disabledCrm: false,
  unreadCount: 0,
  plan: { code: "free", planType: "FREE" },
  offline: false,
};

export const botsPageFixture: { list: Bot[]; next?: string } = {
  list: [bot],
  next: "fake-next-cursor",
};

export const botDetailFixture: BotDetail = { ...bot, hasChatRoom: true };
