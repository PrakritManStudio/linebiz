import { ValidationError } from "../core/errors.js";
import type { RequestOptions } from "../core/http.js";
import { paginate, readListResponse } from "../core/pagination.js";
import type { PagePromise } from "../core/pagination.js";
import type { Contact } from "../types/index.js";
import { APIResource } from "./resource.js";

/** Which contacts to list. */
export type ContactFilter = "ALL" | "FRIEND" | "NOT_FRIEND" | "GROUP" | "SPAM";
/** Field contacts are sorted by. */
export type ContactSortBy = "DISPLAY_NAME" | "LAST_TALKED_AT";
/** Sort direction. */
export type SortOrder = "ASC" | "DESC";

const FILTERS: readonly ContactFilter[] = ["ALL", "FRIEND", "NOT_FRIEND", "GROUP", "SPAM"];
const SORT_KEYS: readonly ContactSortBy[] = ["DISPLAY_NAME", "LAST_TALKED_AT"];
const SORT_ORDERS: readonly SortOrder[] = ["ASC", "DESC"];

/** Parameters of {@link ContactsResource.list}. */
export interface ContactListParams {
  /** Search text matched against contact names (default: empty, which matches all). */
  query?: string;
  /** Which contacts to list (default `"ALL"`). */
  filter?: ContactFilter;
  /** Sort field (default `"DISPLAY_NAME"`). */
  sortBy?: ContactSortBy;
  /** Sort direction (default `"ASC"`). */
  order?: SortOrder;
  /** Items per page, 1-100 (default 20). */
  limit?: number;
  /** Cursor to resume from; omit to start at the first page. */
  cursor?: string;
}

/** Contacts (friends and groups) of a bot. */
export class ContactsResource extends APIResource {
  /**
   * Lists or searches the contacts of a bot. The result can be awaited for the first page
   * or iterated item by item.
   * @param botId ID of the bot.
   * @param params Search text, filter, sorting, page size and starting cursor.
   * @param options Per-call options (the signal and timeout apply to every page).
   * @returns A promise of the first page that is also async-iterable.
   */
  list(
    botId: string,
    params: ContactListParams = {},
    options?: RequestOptions,
  ): PagePromise<Contact> {
    const { _http: http, _validator: v } = this._client;
    return paginate<Contact>(async (cursor) => {
      const id = v.id("botId", botId);
      const query: unknown = params.query ?? "";
      if (typeof query !== "string") {
        throw new ValidationError({ param: "query", value: query, reason: "must be a string" });
      }
      const filterKey = v.oneOf("filter", params.filter ?? "ALL", FILTERS);
      const sortKey = v.oneOf("sortBy", params.sortBy ?? "DISPLAY_NAME", SORT_KEYS);
      const sortOrder = v.oneOf("order", params.order ?? "ASC", SORT_ORDERS);
      const limit = v.int("limit", params.limit ?? 20, { min: 1, max: 100 });
      const next = v.optionalString("cursor", cursor);
      const raw = await http.request<unknown>(
        {
          service: "chat",
          method: "GET",
          path: `/api/v2/bots/${encodeURIComponent(id)}/contacts`,
          query: { query, sortKey, sortOrder, filterKey, limit, next },
        },
        options,
      );
      return readListResponse<Contact>(raw, "next");
    }, params.cursor);
  }
}
