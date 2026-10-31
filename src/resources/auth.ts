import { UnexpectedResponseError } from "../core/errors.js";
import type { RequestOptions } from "../core/http.js";
import { APIResource } from "./resource.js";

/** Sign-out of the web session. */
export class AuthResource extends APIResource {
  /**
   * Signs the session out: asks the chat service for the logout URL, then calls it
   * (on the account host, without following redirects). The URL must be a https
   * `*.line.biz` or `*.line.me` address, otherwise the call is refused before any cookie is sent.
   * @param options Per-call options.
   * @throws {UnexpectedResponseError} If the response has no `logoutUri` or it points outside LINE.
   */
  async logout(options?: RequestOptions): Promise<void> {
    const http = this._client._http;
    const raw = await http.request<unknown>(
      {
        service: "chat",
        method: "POST",
        path: "/api/v1/logoutUri",
        body: { redirectPath: "/" },
      },
      options,
    );
    const logoutUri =
      typeof raw === "object" && raw !== null
        ? (raw as { logoutUri?: unknown }).logoutUri
        : undefined;
    if (typeof logoutUri !== "string" || logoutUri === "") {
      throw new UnexpectedResponseError('Expected "logoutUri" to be a string', { body: raw });
    }
    await http.request<unknown>(
      {
        service: "account",
        method: "GET",
        path: "",
        absoluteURL: logoutUri,
        allowRedirect: true,
      },
      options,
    );
  }
}
