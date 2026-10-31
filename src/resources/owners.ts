import type { RequestOptions } from "../core/http.js";
import { readListResponse } from "../core/pagination.js";
import type { Owner } from "../types/index.js";
import { APIResource } from "./resource.js";

/** Parameters of {@link OwnersResource.list}. */
export interface OwnerListParams {
  /** Only return these owners (LINE Business ID UUIDs). */
  bizIds?: string[];
}

/** Owners (administrators) of a bot. */
export class OwnersResource extends APIResource {
  /**
   * Lists the owners of a bot.
   * @param botId ID of the bot.
   * @param params Optional filter.
   * @param options Per-call options.
   * @returns The owners.
   */
  async list(
    botId: string,
    params: OwnerListParams = {},
    options?: RequestOptions,
  ): Promise<Owner[]> {
    const v = this._client._validator;
    const id = v.id("botId", botId);
    const bizIds = params.bizIds === undefined ? undefined : v.uuidList("bizIds", params.bizIds);
    const raw = await this._client._http.request<unknown>(
      {
        service: "chat",
        method: "GET",
        path: `/api/v1/bots/${encodeURIComponent(id)}/owners`,
        query: { bizIds },
      },
      options,
    );
    return readListResponse<Owner>(raw, "next").items;
  }
}
