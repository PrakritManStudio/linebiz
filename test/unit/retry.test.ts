import { describe, it, expect } from "vitest";
import { backoffDelay, isRetryableStatus, parseRetryAfter } from "../../src/core/retry.js";

describe("parseRetryAfter", () => {
  it("parses seconds", () => {
    expect(parseRetryAfter("3")).toBe(3000);
  });
  it("parses HTTP date", () => {
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
  });
  it("caps at 60s", () => {
    expect(parseRetryAfter("600")).toBe(60_000);
  });
  it("returns undefined for garbage/null", () => {
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("backoffDelay", () => {
  it("grows and caps", () => {
    expect(backoffDelay(0, () => 0.5)).toBe(500);
    expect(backoffDelay(10, () => 0.5)).toBe(8000);
    expect(backoffDelay(0, () => 0)).toBe(375);
    expect(backoffDelay(0, () => 1)).toBe(625);
  });
});

describe("isRetryableStatus", () => {
  it("identifies retryable statuses", () => {
    for (const s of [408, 429, 500, 503]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [400, 401, 403, 404]) expect(isRetryableStatus(s)).toBe(false);
  });
});
