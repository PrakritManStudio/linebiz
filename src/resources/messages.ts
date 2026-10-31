import type { RequestOptions } from "../core/http.js";
import { paginate, readListResponse } from "../core/pagination.js";
import type { PagePromise } from "../core/pagination.js";
import type { FlexContainer, MessageEvent } from "../types/index.js";
import { APIResource } from "./resource.js";

/** Parameters of {@link MessagesResource.list}. */
export interface MessageListParams {
  /** Cursor to resume from (the `backward` cursor of a previous page); omit to start at the newest messages. */
  cursor?: string;
}

/** Parameters of {@link MessagesResource.retrieveFlex}. */
export interface MessageRetrieveFlexParams {
  /** Timestamp of the message in milliseconds, as digits. */
  timestamp?: string;
}

/** Messages of a chat. */
export class MessagesResource extends APIResource {
  /**
   * Lists the messages of a chat, newest first. The result can be awaited for the first page
   * or iterated item by item; following pages go further back in time.
   * @param botId ID of the bot.
   * @param chatId ID of the chat.
   * @param params Starting cursor.
   * @param options Per-call options (the signal and timeout apply to every page).
   * @returns A promise of the first page that is also async-iterable.
   */
  list(
    botId: string,
    chatId: string,
    params: MessageListParams = {},
    options?: RequestOptions,
  ): PagePromise<MessageEvent> {
    const { _http: http, _validator: v } = this._client;
    return paginate<MessageEvent>(async (cursor) => {
      const bot = v.id("botId", botId);
      const chat = v.id("chatId", chatId);
      const backward = v.optionalString("cursor", cursor);
      const raw = await http.request<unknown>(
        {
          service: "chat",
          method: "GET",
          path: `/api/v3/bots/${encodeURIComponent(bot)}/chats/${encodeURIComponent(chat)}/messages`,
          query: { backward },
        },
        options,
      );
      return readListResponse<MessageEvent>(raw, "backward");
    }, params.cursor);
  }

  /**
   * Retrieves the Flex Message container of a message.
   * @param botId ID of the bot.
   * @param chatId ID of the chat.
   * @param messageId ID of the message (digits).
   * @param params Optional message timestamp.
   * @param options Per-call options.
   * @returns The Flex container.
   */
  async retrieveFlex(
    botId: string,
    chatId: string,
    messageId: string,
    params: MessageRetrieveFlexParams = {},
    options?: RequestOptions,
  ): Promise<FlexContainer> {
    const v = this._client._validator;
    const bot = v.id("botId", botId);
    const chat = v.id("chatId", chatId);
    const message = v.digits("messageId", messageId);
    const timestamp =
      params.timestamp === undefined ? undefined : v.digits("timestamp", params.timestamp);
    return this._client._http.request<FlexContainer>(
      {
        service: "chat",
        method: "GET",
        path: `/api/v1/bots/${encodeURIComponent(bot)}/chats/${encodeURIComponent(chat)}/messages/flexJson`,
        query: { messageId: message, timestamp },
      },
      options,
    );
  }
}
