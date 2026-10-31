import type { LineBizClient } from "../client.js";

/** Base class of every API resource; gives subclasses access to the owning client. */
export abstract class APIResource {
  /** @internal The client that owns this resource. */
  protected readonly _client: LineBizClient;

  /** @param client The client used to perform requests. */
  constructor(client: LineBizClient) {
    this._client = client;
  }
}
