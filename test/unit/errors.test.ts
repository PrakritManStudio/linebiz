import { describe, it, expect } from "vitest";
import {
  APIError,
  AuthenticationError,
  ConnectionError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  isLineBizError,
  truncateBody,
} from "../../src/core/errors.js";

const base = {
  headers: { "set-cookie": "a=1", "x-id": "1" },
  method: "GET",
  url: "https://chat.line.biz/api/v1/me",
};

describe("errors", () => {
  it("401 not_login -> SESSION_EXPIRED", () => {
    const e = APIError.from({ ...base, status: 401, body: { code: "not_login" } });
    expect(e).toBeInstanceOf(AuthenticationError);
    expect(e.code).toBe("SESSION_EXPIRED");
  });
  it("401 other -> UNAUTHORIZED", () => {
    expect(APIError.from({ ...base, status: 401, body: {} }).code).toBe("UNAUTHORIZED");
  });
  it.each([
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [429, RateLimitError],
    [502, InternalServerError],
  ])("%i maps to class", (status, cls) => {
    expect(APIError.from({ ...base, status, body: null })).toBeInstanceOf(cls);
  });
  it("418 -> plain APIError API_ERROR", () => {
    const e = APIError.from({ ...base, status: 418, body: null });
    expect(e.constructor).toBe(APIError);
    expect(e.code).toBe("API_ERROR");
  });
  it("RateLimitError reads retry-after", () => {
    expect(
      (
        APIError.from({
          ...base,
          headers: { "retry-after": "2" },
          status: 429,
          body: null,
        }) as RateLimitError
      ).retryAfter,
    ).toBe(2000);
  });
  it("redacts set-cookie in APIError.headers", () => {
    expect(APIError.from({ ...base, status: 500, body: null }).headers["set-cookie"]).toBe(
      "[REDACTED]",
    );
  });
  it("keeps cause", () => {
    const cause = new Error("x");
    expect(new ConnectionError("down", { cause }).cause).toBe(cause);
  });
  it("ValidationError fields + message", () => {
    const e = new ValidationError({ param: "limit", value: 0, reason: "must be between 1 and 25" });
    expect(e.message).toBe('Invalid parameter "limit": must be between 1 and 25');
    expect(e.code).toBe("INVALID_PARAMETER");
  });
  it("isLineBizError true for subclasses, false for plain errors and look-alikes", () => {
    expect(isLineBizError(new TimeoutError("t"))).toBe(true);
    expect(isLineBizError(new Error("x"))).toBe(false);
    expect(isLineBizError({ name: "LineBizError" })).toBe(false);
  });
  it("TimeoutError is a ConnectionError", () => {
    expect(new TimeoutError("t")).toBeInstanceOf(ConnectionError);
  });
  it("truncateBody", () => {
    expect(truncateBody("x".repeat(3000))).toHaveLength(2000);
  });
});
