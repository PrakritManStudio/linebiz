/** Identifier of a LINE Official Account web service the SDK talks to. */
export type Service = "chat" | "manager" | "account";

/** Default base URL of each {@link Service}. */
export const DEFAULT_BASE_URLS: Readonly<Record<Service, string>> = {
  chat: "https://chat.line.biz",
  manager: "https://manager.line.biz",
  account: "https://account.line.biz",
};

/** Default `User-Agent` header sent with every request. */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

/** Default value of the `x-oa-chat-client-version` header sent to the chat service. */
export const DEFAULT_CLIENT_VERSION = "20240513144702";

const ALLOWED_DOMAINS: readonly string[] = ["line.biz", "line.me"];

/**
 * Check whether an absolute URL may receive the session cookies: it must use
 * HTTPS and point at `line.biz`, `line.me` or one of their subdomains.
 *
 * @param url Parsed URL to check.
 * @returns `true` if the SDK may call this URL.
 */
export function isAllowedAbsoluteURL(url: URL): boolean {
  if (url.protocol !== "https:" || url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
