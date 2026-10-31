import type { RequestOptions } from "../core/http.js";
import { paginate, readListResponse } from "../core/pagination.js";
import type { PagePromise } from "../core/pagination.js";
import type { Bot, BotDetail } from "../types/index.js";
import { APIResource } from "./resource.js";

/** Parameters of {@link BotsResource.list}. */
export interface BotListParams {
  /** Items per page, 1-1000 (default 1000). */
  limit?: number;
  /** Cursor to resume from; omit to start at the first page. */
  cursor?: string;
}

/** LINE Official Accounts (bots) the signed-in user can access. */
export class BotsResource extends APIResource {
  /**
   * Lists bots. The result can be awaited for the first page or iterated item by item.
   * @param params Page size and starting cursor.
   * @param options Per-call options (the signal and timeout apply to every page).
   * @returns A promise of the first page that is also async-iterable.
   */
  list(params: BotListParams = {}, options?: RequestOptions): PagePromise<Bot> {
    const { _http: http, _validator: v } = this._client;
    return paginate<Bot>(async (cursor) => {
      const limit = v.int("limit", params.limit ?? 1000, { min: 1, max: 1000 });
      const next = v.optionalString("cursor", cursor);
      const raw = await http.request<unknown>(
        {
          service: "chat",
          method: "GET",
          path: "/api/v1/bots",
          query: { noFilter: true, limit, next },
        },
        options,
      );
      return readListResponse<Bot>(raw, "next");
    }, params.cursor);
  }

  /**
   * Retrieves a single bot.
   * @param botId ID of the bot.
   * @param options Per-call options.
   * @returns The bot details.
   */
  async retrieve(botId: string, options?: RequestOptions): Promise<BotDetail> {
    const id = this._client._validator.id("botId", botId);
    return this._client._http.request<BotDetail>(
      {
        service: "chat",
        method: "GET",
        path: `/api/v1/bots/${encodeURIComponent(id)}`,
        query: { noFilter: true },
      },
      options,
    );
  }
}
