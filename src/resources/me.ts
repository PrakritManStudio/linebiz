import type { RequestOptions } from "../core/http.js";
import type { Me } from "../types/index.js";
import { APIResource } from "./resource.js";

/** The signed-in LINE Business ID user. */
export class MeResource extends APIResource {
  /**
   * Retrieves the signed-in user.
   * @param options Per-call options.
   * @returns The current user.
   */
  async retrieve(options?: RequestOptions): Promise<Me> {
    return this._client._http.request<Me>(
      { service: "chat", method: "GET", path: "/api/v1/me" },
      options,
    );
  }
}
