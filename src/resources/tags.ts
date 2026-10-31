import type { RequestOptions } from "../core/http.js";
import { readListResponse } from "../core/pagination.js";
import type { Tag } from "../types/index.js";
import { APIResource } from "./resource.js";

/** Parameters of {@link TagsResource.list}. */
export interface TagListParams {
  /** Only return these tags. */
  tagIds?: string[];
}

/** Tags of a bot. */
export class TagsResource extends APIResource {
  /**
   * Lists the tags of a bot.
   * @param botId ID of the bot.
   * @param params Optional filter.
   * @param options Per-call options.
   * @returns The tags.
   */
  async list(botId: string, params: TagListParams = {}, options?: RequestOptions): Promise<Tag[]> {
    const v = this._client._validator;
    const id = v.id("botId", botId);
    const tagIds = params.tagIds === undefined ? undefined : v.idList("tagIds", params.tagIds);
    const raw = await this._client._http.request<unknown>(
      {
        service: "chat",
        method: "GET",
        path: `/api/v1/bots/${encodeURIComponent(id)}/tags`,
        query: { tagIds },
      },
      options,
    );
    return readListResponse<Tag>(raw, "next").items;
  }
}
