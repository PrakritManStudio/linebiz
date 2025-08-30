import axios, { type AxiosInstance, AxiosError, type AxiosRequestConfig } from "axios";

import { LineWebError, LineWebErrorCode } from "./errors";
import type { FlexContainer } from "@line/bot-sdk";

import type { Me } from "./type/me";
import type { BotsList, Bot, BotData } from "./type/bots";
import type { OwnersResponse } from "./type/owners";
import type { ChatsResponse, Chat } from "./type/chats";
import type { MessagesResponse, MessageEventType } from "./type/messages";
import type { ContactResponse, Contact } from "./type/contacts";
import type { MemberListResponse, Member } from "./type/members";
import type { TagsResponse } from "./type/tags";

interface Cookie {
  name: string;
  value: string;
}

export class LineWeb {
  public cookies: string;
  private axiosInstance!: AxiosInstance;
  private isExternalAxios = false;
  public userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
  public clientVersion = "20240513144702";
  public lineWebChatIdLength = 33;
  public lineWebBotIdLength = 33;
  public lineWebUserIdLength = 33;

  constructor(options: {
    cookies: string;
    axios?: AxiosInstance;
    axiosConfig?: AxiosRequestConfig;
  }) {
    this.cookies = this.parseCookies(options.cookies);
    if (options.axios) {
      this.axiosInstance = options.axios;
      this.isExternalAxios = true;
    } else {
      this.initAxiosInstance(options.axiosConfig);
    }
  }

  private initAxiosInstance(config?: AxiosRequestConfig): void {
    // Create an internal axios instance. Default headers are also injected per-request,
    // but we keep sensible defaults here for backward compatibility.
    this.axiosInstance = axios.create({
      ...(config ?? {}),
      headers: {
        "User-Agent": this.userAgent,
        "x-oa-chat-client-version": this.clientVersion,
        Cookie: this.cookies,
        ...(config?.headers ?? {}),
      },
    });
    this.isExternalAxios = false;
  }

  private parseCookies(cookies: string): string {
    try {
      const parsedCookies = JSON.parse(cookies) as (Cookie & {
        domain?: string;
      })[];
      const filteredCookies = parsedCookies.filter(
        (cookie) => typeof cookie.domain === "string" && cookie.domain.includes("line.biz"),
      );
      return filteredCookies.map((cookie: Cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    } catch {
      throw new LineWebError({
        code: LineWebErrorCode.INVALID_COOKIE,
        message: "Invalid cookies format. Expected JSON string.",
      });
    }
  }

  public setCookies(cookies: string) {
    this.cookies = this.parseCookies(cookies);
    // If using an internal axios instance, refresh headers on it. For external instances,
    // we do not replace the instance; default headers will be injected per request.
    if (!this.isExternalAxios) {
      this.initAxiosInstance();
    }
  }

  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  public validParamsType({
    webChatId,
    webBotId,
    limitPerPage,
    maxPages,
    nextToken,
    backwardToken,
    webUserIds,
    bizIds,
    tagIds,
    messageId,
    timestamp,
  }: {
    webChatId?: string;
    webBotId?: string;
    limitPerPage?: number;
    maxPages?: number;
    nextToken?: string;
    backwardToken?: string;
    webUserIds?: string[];
    bizIds?: string[];
    tagIds?: string[];
    messageId?: string;
    timestamp?: string;
  }): void {
    if (webChatId !== undefined) {
      if (typeof webChatId !== "string") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid webChatId type (must be a string). Received: ${typeof webChatId}`,
        });
      }
      if (webChatId.trim() === "") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "webChatId cannot be an empty string.",
        });
      }
      if (webChatId.length !== this.lineWebChatIdLength) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid webChatId length (must be ${this.lineWebChatIdLength} characters). Received: ${webChatId.length}`,
        });
      }
      if (!/^[a-zA-Z0-9]+$/.test(webChatId)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "webChatId must contain only a-z, A-Z, 0-9 characters.",
        });
      }
    }
    if (webBotId !== undefined) {
      if (typeof webBotId !== "string") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid webBotId type (must be a string). Received: ${typeof webBotId}`,
        });
      }
      if (webBotId.trim() === "") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "webBotId cannot be an empty string.",
        });
      }
      if (webBotId.length !== this.lineWebBotIdLength) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid webBotId length (must be ${this.lineWebBotIdLength} characters). Received: ${webBotId.length}`,
        });
      }
      if (!/^[a-zA-Z0-9]+$/.test(webBotId)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "webBotId must contain only a-z, A-Z, 0-9 characters.",
        });
      }
    }
    if (limitPerPage !== undefined) {
      if (typeof limitPerPage !== "number" || !Number.isInteger(limitPerPage)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid limitPerPage type (must be an integer). Received: ${typeof limitPerPage}`,
        });
      }
    }
    if (maxPages !== undefined) {
      if (typeof maxPages !== "number" || !Number.isInteger(maxPages)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid maxPages type (must be an integer >= 0). Received: ${typeof maxPages}`,
        });
      }
      if (maxPages < 0) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid maxPages value (must be a non-negative integer). Received: ${maxPages}`,
        });
      }
    }
    if (nextToken !== undefined) {
      if (typeof nextToken !== "string") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid nextToken type (must be a string). Received: ${typeof nextToken}`,
        });
      }
      if (nextToken.trim() === "") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "nextToken cannot be an empty string.",
        });
      }
    }
    if (backwardToken !== undefined) {
      if (typeof backwardToken !== "string") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid backwardToken type (must be a string). Received: ${typeof backwardToken}`,
        });
      }
      if (backwardToken.trim() === "") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "backwardToken cannot be an empty string.",
        });
      }
    }
    if (webUserIds !== undefined) {
      if (!Array.isArray(webUserIds)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid webUserIds type (must be an array of strings). Received: ${typeof webUserIds}`,
        });
      }
      for (const id of webUserIds) {
        if (typeof id !== "string") {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: `Invalid webUserId type (must be a string). Received: ${typeof id}`,
          });
        }
        if (id.trim() === "") {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: "webUserId cannot be an empty string.",
          });
        }
        if (id.length !== this.lineWebUserIdLength) {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: `Invalid webUserId length (must be ${this.lineWebUserIdLength} characters). Received: ${id.length}`,
          });
        }
        if (!/^[a-zA-Z0-9]+$/.test(id)) {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: "webUserId must contain only a-z, A-Z, 0-9 characters.",
          });
        }
      }
    }
    if (bizIds !== undefined) {
      if (!Array.isArray(bizIds)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid bizIds type (must be an array of strings). Received: ${typeof bizIds}`,
        });
      }
      for (const id of bizIds) {
        if (typeof id !== "string") {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: `Invalid bizId type (must be a string). Received: ${typeof id}`,
          });
        }
        if (id.trim() === "") {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: "bizId cannot be an empty string.",
          });
        }
        if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: "bizId must be a valid UUID (36 characters, hex and dashes).",
          });
        }
        if (id.length !== 36) {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: `Invalid bizId length (must be 36 characters for UUID). Received: ${id.length}`,
          });
        }
      }
    }
    if (tagIds !== undefined) {
      if (!Array.isArray(tagIds)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid tagIds type (must be an array of strings). Received: ${typeof tagIds}`,
        });
      }
      for (const id of tagIds) {
        if (typeof id !== "string") {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: `Invalid tagId type (must be a string). Received: ${typeof id}`,
          });
        }
        if (id.trim() === "") {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: "tagId cannot be an empty string.",
          });
        }
        if (!/^[a-zA-Z0-9]+$/.test(id)) {
          throw new LineWebError({
            code: LineWebErrorCode.INVALID_PARAMETER,
            message: "tagId must contain only a-z, A-Z, 0-9 characters.",
          });
        }
      }
    }
    if (messageId !== undefined) {
      if (typeof messageId !== "string") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid messageId type (must be a string). Received: ${typeof messageId}`,
        });
      }
      if (messageId.trim() === "") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "messageId cannot be an empty string.",
        });
      }
      if (!/^[0-9]+$/.test(messageId)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "messageId must contain only digits (0-9).",
        });
      }
    }
    if (timestamp !== undefined) {
      if (typeof timestamp !== "string") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: `Invalid timestamp type (must be a string). Received: ${typeof timestamp}`,
        });
      }
      if (timestamp.trim() === "") {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "timestamp cannot be an empty string.",
        });
      }
      if (!/^[0-9]+$/.test(timestamp)) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "timestamp must contain only digits (0-9).",
        });
      }
    }
  }

  private handleAxiosError(error: unknown | AxiosError) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401 && error.response?.data?.code === "not_login") {
        throw new LineWebError({
          code: LineWebErrorCode.EXPIRED_COOKIE,
          message: "Cookies have expired or are not logged in.",
          cause: error,
          status: error.response?.status,
        });
      }

      if (
        error.response?.status === 404 &&
        error.response?.data?.code === "not_found_operatable_bot"
      ) {
        throw new LineWebError({
          code: LineWebErrorCode.NOT_FOUND,
          message: "Bot not found or not operatable.",
        });
      }

      throw new LineWebError({
        code: LineWebErrorCode.AXIOS_ERROR,
        message: "Axios error occurred",
        cause: error,
        status: error.response?.status,
      });
    }
  }

  private async request<T>(config: AxiosRequestConfig, message: string): Promise<T> {
    try {
      const defaultHeaders = {
        "User-Agent": this.userAgent,
        "x-oa-chat-client-version": this.clientVersion,
        Cookie: this.cookies,
        "Content-Type": "application/json",
      } as Record<string, string>;

      const response = await this.axiosInstance.request<T>({
        ...config,
        headers: { ...defaultHeaders, ...(config.headers ?? {}) },
      });
      return response.data;
    } catch (error: unknown | AxiosError) {
      this.handleAxiosError(error);
      throw new LineWebError({
        code: LineWebErrorCode.UNKNOWN_ERROR,
        message,
        cause: error,
      });
    }
  }

  // Allow users to inject a custom Axios instance after construction
  public setAxiosInstance(instance: AxiosInstance): void {
    this.axiosInstance = instance;
    this.isExternalAxios = true;
  }

  // Allow users to configure the current axios instance defaults from outside the class
  public updateAxiosConfig(config: AxiosRequestConfig): void {
    if (!this.axiosInstance) {
      this.initAxiosInstance(config);
      return;
    }
    // Update defaults on the existing instance to preserve interceptors
    Object.assign(this.axiosInstance.defaults, config);
    if (config.headers) {
      // Ensure headers merge without losing existing defaults
      this.axiosInstance.defaults.headers = {
        ...(this.axiosInstance.defaults.headers as any),
        ...(config.headers as any),
      } as any;
    }
  }

  public async getMe(): Promise<Me> {
    const API_URL = "https://chat.line.biz/api/v1/me";
    return this.request<Me>({ url: API_URL, method: "get" }, "Failed to fetch user profile");
  }

  // Function overloads for dynamic return types
  public async getBots(params: {
    limitPerPage?: number;
    maxPages?: number;
    nextToken?: string;
    webBotId: string;
  }): Promise<Bot>;
  public async getBots(params: {
    limitPerPage?: number;
    maxPages?: number;
    nextToken?: string;
    webBotId?: undefined;
  }): Promise<BotsList>;
  public async getBots({
    limitPerPage = 1000,
    maxPages = 1,
    nextToken,
    webBotId,
  }: {
    limitPerPage?: number;
    maxPages?: number;
    nextToken?: string;
    webBotId?: string;
  }): Promise<Bot | BotsList> {
    this.validParamsType({
      limitPerPage,
      maxPages,
      nextToken,
      webBotId,
    });
    if (limitPerPage < 1 || limitPerPage > 1000) {
      throw new LineWebError({
        code: LineWebErrorCode.INVALID_PARAMETER,
        message: `Invalid limitPerPage value (must be between 1 and 1000). Received: ${limitPerPage}`,
      });
    }

    if (webBotId) {
      if (nextToken) {
        throw new LineWebError({
          code: LineWebErrorCode.INVALID_PARAMETER,
          message: "nextToken is not supported when webBotId is provided.",
        });
      }
      const API_URL = `https://chat.line.biz/api/v1/bots/${webBotId}?noFilter=true`;
      return this.request<Bot>({ url: API_URL, method: "get" }, "Failed to fetch bot");
    } else {
      function API_URL(limitPerPage: number, nextToken?: string) {
        return (
          `https://chat.line.biz/api/v1/bots?noFilter=true&limit=${limitPerPage}` +
          (nextToken ? `&next=${nextToken}` : "")
        );
      }

      let allBot: BotData[] = [];
      let next = nextToken;
      let pageCount = 0;

      do {
        const url = API_URL(limitPerPage, next);
        const data = await this.request<BotsList>({ url, method: "get" }, "Failed to fetch bots");
        allBot = [...allBot, ...data.list];
        next = data.next;
        pageCount++;

        if (maxPages > 0 && pageCount >= maxPages) {
          break;
        }
      } while (next);

      return { list: allBot, next };
    }
  }

  public async getOwners({
    webBotId,
    bizIds,
  }: {
    webBotId: string;
    bizIds?: string[];
  }): Promise<OwnersResponse> {
    this.validParamsType({ webBotId, bizIds });

    const API_URL =
      `https://chat.line.biz/api/v1/bots/${webBotId}/owners` +
      (bizIds ? `?bizIds=${bizIds.join(",")}` : "");
    return this.request<OwnersResponse>({ url: API_URL, method: "get" }, "Failed to fetch owners");
  }

  public async getTags({
    webBotId,
    tagIds,
  }: {
    webBotId: string;
    tagIds?: string[];
  }): Promise<TagsResponse> {
    // this.validParamsType({ webBotId, tagIds });
    const API_URL =
      `https://chat.line.biz/api/v1/bots/${webBotId}/tags` +
      (tagIds ? `?tagIds=${tagIds.join(",")}` : "");
    return this.request<TagsResponse>({ url: API_URL, method: "get" }, "Failed to fetch tags");
  }

  /**
   * ดึงรายการแชทสำหรับ web bot ที่ระบุ โดยรองรับการแบ่งหน้า (pagination)
   *
   * @param params - พารามิเตอร์สำหรับการดึงแชท
   * @param params.webBotId - รหัสเฉพาะของ LINE web bot
   * @param params.limitPerPage - (ไม่บังคับ) จำนวนแชทสูงสุดต่อหน้า ค่าเริ่มต้นคือ 25
   * @param params.maxPages - (ไม่บังคับ) จำนวนหน้าสูงสุดที่จะดึงข้อมูล หากตั้งเป็น 0 จะดึงทุกหน้าที่มีอยู่ ค่าเริ่มต้นคือ 1
   * @param params.nextToken - (ไม่บังคับ) โทเคนสำหรับดึงหน้าถัดไป หากต้องการแบ่งหน้า
   * @returns Promise ที่คืนค่าเป็นอาเรย์ของอ็อบเจ็กต์ `Chat`
   *
   * @remarks
   * - หาก `maxPages` เป็น 0 เมธอดจะดึงข้อมูลต่อเนื่องจนกว่าจะไม่มีหน้าถัดไป
   * - หาก `maxPages` มากกว่า 0 เมธอดจะดึงข้อมูลสูงสุดตามจำนวนหน้าที่กำหนด หรือจนกว่าจะไม่มีหน้าถัดไป แล้วแต่ว่าอย่างใดจะเกิดก่อน
   * - ใช้ `axiosInstance` ภายในสำหรับส่ง HTTP requests
   */
  public async getChats({
    webBotId,
    limitPerPage = 25,
    maxPages = 1,
    nextToken,
  }: {
    webBotId: string;
    limitPerPage?: number;
    maxPages?: number;
    nextToken?: string;
  }): Promise<ChatsResponse> {
    this.validParamsType({ webBotId, limitPerPage, maxPages, nextToken });
    if (limitPerPage < 1 || limitPerPage > 25) {
      throw new LineWebError({
        code: LineWebErrorCode.INVALID_PARAMETER,
        message: `Invalid limitPerPage value (must be between 1 and 25). Received: ${limitPerPage}`,
      });
    }
    function API_URL(_webBotId: string, _limitPerPage: number, _nextToken?: string) {
      const baseUrl = `https://chat.line.biz/api/v2/bots/${_webBotId}/chats?folderType=ALL&tagIds=&autoTagIds=&limit=${_limitPerPage}&prioritizePinnedChat=true`;
      return _nextToken ? `${baseUrl}&next=${_nextToken}` : baseUrl;
    }

    let allChats: Chat[] = [];
    let next = nextToken;
    let pageCount = 0;

    do {
      const url = API_URL(webBotId, limitPerPage, next);
      const data = await this.request<ChatsResponse>(
        { url, method: "get" },
        "Failed to fetch chats",
      );

      allChats = [...allChats, ...data.list];
      next = data.next;
      pageCount++;

      if (maxPages > 0 && pageCount >= maxPages) {
        break;
      }
    } while (next);

    return { list: allChats, next };
  }

  /**
   * ดึงข้อความจากแชท LINE โดยใช้ bot และ chat ID ที่ระบุ พร้อมรองรับการแบ่งหน้า (pagination)
   *
   * @param params - พารามิเตอร์สำหรับการดึงข้อความ
   * @param params.webBotId - รหัสของ LINE web bot
   * @param params.webChatId - รหัสของ LINE web chat
   * @param params.maxPages - (ไม่บังคับ) จำนวนหน้าสูงสุดที่จะดึง ค่าเริ่มต้นคือ 1
   * @param params.backward - (ไม่บังคับ) โทเคนสำหรับแบ่งหน้าเพื่อดึงข้อความย้อนหลัง
   * @returns Promise ที่คืนค่าเป็นอาเรย์ของ `MessageEventType` ที่ดึงมาได้
   *
   * @throws จะเกิด error หาก `webBotId` ที่ระบุไม่ถูกต้อง
   *
   * @remarks
   * เมธอดนี้ใช้ LINE chat API ในการดึงข้อความ รองรับการแบ่งหน้าด้วย `backward` token
   * และจำกัดจำนวนหน้าที่ดึงตามค่าพารามิเตอร์ `maxPages` โดยจะหน่วงเวลาก่อน request แรกเพื่อหลีกเลี่ยงการถูกจำกัด rate
   */
  public async getMessages({
    webBotId,
    webChatId,
    maxPages = 1,
    backwardToken,
  }: {
    webBotId: string;
    webChatId: string;
    maxPages?: number;
    backwardToken?: string;
  }): Promise<MessagesResponse> {
    this.validParamsType({ webBotId, webChatId, maxPages, backwardToken });
    function API_URL(_webBotId: string, _webChatId: string, _backward?: string) {
      const baseUrl = `https://chat.line.biz/api/v3/bots/${_webBotId}/chats/${_webChatId}/messages`;
      return _backward ? `${baseUrl}?backward=${_backward}` : baseUrl;
    }

    let allMessages: MessageEventType[] = [];
    let backward = backwardToken;
    let pageCount = 0;

    do {
      const url = API_URL(webBotId, webChatId, backward);
      const data = await this.request<MessagesResponse>(
        { url, method: "get" },
        "Failed to fetch messages",
      );

      allMessages = [...allMessages, ...data.list];
      backward = data.backward;
      pageCount++;

      if (maxPages > 0 && pageCount >= maxPages) {
        break;
      }
    } while (backward);

    return { list: allMessages, backward };
  }

  public async getContactByName({
    webBotId,
    chatName,
    limitPerPage = 20,
    maxPages = 1,
    nextToken,
    filterKey = "ALL",
    sortKey = "DISPLAY_NAME",
    sortOrder = "ASC",
  }: {
    webBotId: string;
    chatName: string;
    limitPerPage?: number;
    maxPages?: number;
    nextToken?: string;
    filterKey?: "ALL" | "FRIEND" | "NOT_FRIEND" | "GROUP" | "SPAM";
    sortKey?: "DISPLAY_NAME" | "LAST_TALKED_AT";
    sortOrder?: "ASC" | "DESC";
  }): Promise<ContactResponse> {
    this.validParamsType({ webBotId, limitPerPage, maxPages, nextToken });
    if (limitPerPage < 1 || limitPerPage > 100) {
      throw new LineWebError({
        code: LineWebErrorCode.INVALID_PARAMETER,
        message: `Invalid limitPerPage value (must be between 1 and 100). Received: ${limitPerPage}`,
      });
    }
    const encodedChatName = encodeURIComponent(chatName);
    function API_URL(
      _webBotId: string,
      _chatName: string,
      _filterKey: string,
      _limitPerPage: number,
      _sortKey: string,
      _sortOrder: string,
    ) {
      return `https://chat.line.biz/api/v2/bots/${_webBotId}/contacts?query=${_chatName}&sortKey=${_sortKey}&sortOrder=${_sortOrder}&filterKey=${_filterKey}&limit=${_limitPerPage}`;
    }

    let allContact: Contact[] = [];
    let next = nextToken;
    let pageCount = 0;

    do {
      const url = API_URL(webBotId, encodedChatName, filterKey, limitPerPage, sortKey, sortOrder);
      const data = await this.request<ContactResponse>(
        { url, method: "get" },
        "Failed to fetch contacts",
      );
      allContact = [...allContact, ...data.list];
      next = data.next;
      pageCount++;

      if (maxPages > 0 && pageCount >= maxPages) {
        break;
      }
    } while (next);

    return { list: allContact, next };
  }

  public async getChatMembers({
    webBotId,
    webChatId,
    limitPerPage = 100,
    webUserIds,
    nextToken,
    maxPages = 1,
  }: {
    webBotId: string;
    webChatId: string;
    limitPerPage?: number;
    webUserIds?: string[];
    nextToken?: string;
    maxPages?: number;
  }): Promise<MemberListResponse> {
    this.validParamsType({
      webBotId,
      webChatId,
      limitPerPage,
      webUserIds,
      nextToken,
      maxPages,
    });
    if (limitPerPage < 1 || limitPerPage > 100) {
      throw new LineWebError({
        code: LineWebErrorCode.INVALID_PARAMETER,
        message: `Invalid limitPerPage value (must be between 1 and 100). Received: ${limitPerPage}`,
      });
    }

    function API_URL(
      _webBotId: string,
      _webChatId: string,
      _limitPerPage: number,
      _userIds?: string[],
      _nextToken?: string,
    ) {
      return (
        `https://chat.line.biz/api/v1/bots/${_webBotId}/chats/${_webChatId}/members?limit=${_limitPerPage}` +
        (_userIds ? `&userIds=${_userIds.join(",")}` : "") +
        (_nextToken ? `&next=${_nextToken}` : "")
      );
    }

    let allMembers: Member[] = [];
    let next = nextToken;
    let pageCount = 0;

    do {
      const url = API_URL(webBotId, webChatId, limitPerPage, webUserIds, next);
      const data = await this.request<MemberListResponse>(
        { url, method: "get" },
        "Failed to fetch chat members",
      );
      allMembers = [...allMembers, ...data.list];
      next = data.next;
      pageCount++;

      if (maxPages > 0 && pageCount >= maxPages) {
        break;
      }
    } while (next);

    return { list: allMembers, next };
  }

  public async getFlexMessageContent({
    webBotId,
    webChatId,
    messageId,
    timestamp,
  }: {
    webBotId: string;
    webChatId: string;
    messageId: string;
    timestamp?: string;
  }) {
    this.validParamsType({ webBotId, webChatId, messageId, timestamp });

    const API_URL =
      `https://chat.line.biz/api/v1/bots/${webBotId}/chats/${webChatId}/messages/flexJson?messageId=${messageId}` +
      (timestamp ? `&timestamp=${timestamp}` : "");
    return this.request<FlexContainer>(
      { url: API_URL, method: "get" },
      "Failed to fetch flex message content",
    );
  }

  public async logout(): Promise<void> {
    const API_URL = "https://chat.line.biz/api/v1/logoutUri";

    const res = await this.request<{ logoutUri: string }>(
      {
        url: API_URL,
        method: "post",
        data: { redirectPath: "/" },
      },
      "Failed to logout",
    );
    if (!res.logoutUri) {
      throw new LineWebError({
        code: LineWebErrorCode.LOGOUT_FAILURE,
        message: "Logout URI not found in the response",
      });
    }

    await this.request({ url: res.logoutUri, method: "get" }, "Failed to logout");
  }
}
