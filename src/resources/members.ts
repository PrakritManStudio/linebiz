import type { RequestOptions } from "../core/http.js";
import { paginate, readListResponse } from "../core/pagination.js";
import type { PagePromise } from "../core/pagination.js";
import type { Member } from "../types/index.js";
import { APIResource } from "./resource.js";

/** Parameters of {@link MembersResource.list}. */
export interface MemberListParams {
  /** Only return these users (default: all members). */
  userIds?: string[];
  /** Items per page, 1-100 (default 100). */
  limit?: number;
  /** Cursor to resume from; omit to start at the first page. */
  cursor?: string;
}

/** Members of a group chat. */
export class MembersResource extends APIResource {
  /**
   * Lists the members of a chat. The result can be awaited for the first page or iterated item by item.
   * @param botId ID of the bot.
   * @param chatId ID of the chat.
   * @param params User filter, page size and starting cursor.
   * @param options Per-call options (the signal and timeout apply to every page).
   * @returns A promise of the first page that is also async-iterable.
   */
  list(
    botId: string,
    chatId: string,
    params: MemberListParams = {},
    options?: RequestOptions,
  ): PagePromise<Member> {
    const { _http: http, _validator: v } = this._client;
    return paginate<Member>(async (cursor) => {
      const bot = v.id("botId", botId);
      const chat = v.id("chatId", chatId);
      const limit = v.int("limit", params.limit ?? 100, { min: 1, max: 100 });
      let userIds: string[] | undefined;
      if (params.userIds !== undefined) {
        const rawIds: unknown = params.userIds;
        if (!Array.isArray(rawIds)) v.idList("userIds", rawIds); // rejects non-arrays
        userIds = (rawIds as unknown[]).map((userId) => v.id("userIds", userId));
      }
      const next = v.optionalString("cursor", cursor);
      const raw = await http.request<unknown>(
        {
          service: "chat",
          method: "GET",
          path: `/api/v1/bots/${encodeURIComponent(bot)}/chats/${encodeURIComponent(chat)}/members`,
          query: { limit, userIds, next },
        },
        options,
      );
      return readListResponse<Member>(raw, "next");
    }, params.cursor);
  }
}
