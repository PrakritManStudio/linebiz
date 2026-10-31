import type { RequestOptions } from "../core/http.js";
import { paginate, readListResponse } from "../core/pagination.js";
import type { PagePromise } from "../core/pagination.js";
import type { Chat } from "../types/index.js";
import { APIResource } from "./resource.js";

/** Parameters of {@link ChatsResource.list}. */
export interface ChatListParams {
  /** Items per page, 1-25 (default 25). */
  limit?: number;
  /** Only return chats that have these tags (default: no tag filter). */
  tagIds?: string[];
  /** Chat folder to list (default `"ALL"`). */
  folderType?: string;
  /** Whether pinned chats come first (default `true`). */
  prioritizePinned?: boolean;
  /** Cursor to resume from; omit to start at the first page. */
  cursor?: string;
}

/** Chats of a bot. */
export class ChatsResource extends APIResource {
  /**
   * Lists the chats of a bot. The result can be awaited for the first page or iterated item by item.
   * @param botId ID of the bot.
   * @param params Filters, page size and starting cursor.
   * @param options Per-call options (the signal and timeout apply to every page).
   * @returns A promise of the first page that is also async-iterable.
   */
  list(botId: string, params: ChatListParams = {}, options?: RequestOptions): PagePromise<Chat> {
    const { _http: http, _validator: v } = this._client;
    return paginate<Chat>(async (cursor) => {
      const id = v.id("botId", botId);
      const folderType = v.optionalString("folderType", params.folderType) ?? "ALL";
      const tagIds = v.idList("tagIds", params.tagIds ?? []);
      const limit = v.int("limit", params.limit ?? 25, { min: 1, max: 25 });
      const prioritizePinned = params.prioritizePinned ?? true;
      const next = v.optionalString("cursor", cursor);
      const raw = await http.request<unknown>(
        {
          service: "chat",
          method: "GET",
          path: `/api/v2/bots/${encodeURIComponent(id)}/chats`,
          query: {
            folderType,
            tagIds,
            autoTagIds: "",
            limit,
            prioritizePinnedChat: prioritizePinned,
            next,
          },
        },
        options,
      );
      return readListResponse<Chat>(raw, "next");
    }, params.cursor);
  }
}
