import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/core/errors.js";
import { Validator } from "../../src/core/validate.js";

const v = new Validator(true);
const loose = new Validator(false);
const ID = "U" + "a".repeat(32);

describe("Validator (strict)", () => {
  it("id ok", () => {
    expect(v.id("botId", ID)).toBe(ID);
  });

  it.each<[unknown, string]>([
    ["", "empty"],
    ["U123", "short"],
    ["U" + "-".repeat(32), "chars"],
    [123, "type"],
  ])("id rejects %s (%s)", (bad) => {
    expect(() => v.id("botId", bad)).toThrow(ValidationError);
  });

  it("error carries param, value and reason", () => {
    try {
      v.id("chatId", "x");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).param).toBe("chatId");
      expect((e as ValidationError).value).toBe("x");
      expect((e as ValidationError).reason).toBeTruthy();
    }
  });

  it("idList", () => {
    expect(v.idList("tagIds", ["abc", "123"])).toEqual(["abc", "123"]);
    expect(() => v.idList("tagIds", ["ok", "bad-id"])).toThrow(ValidationError);
    expect(() => v.idList("tagIds", "abc")).toThrow(ValidationError);
    expect(() => v.idList("tagIds", [1])).toThrow(ValidationError);
  });

  it("int range", () => {
    expect(v.int("limit", 25, { min: 1, max: 25 })).toBe(25);
    expect(() => v.int("limit", 26, { min: 1, max: 25 })).toThrow(/between 1 and 25/);
    expect(() => v.int("limit", 0, { min: 1, max: 25 })).toThrow(/between 1 and 25/);
    expect(() => v.int("limit", 1.5, { min: 1, max: 25 })).toThrow(ValidationError);
    expect(() => v.int("limit", "1", { min: 1, max: 25 })).toThrow(ValidationError);
    expect(() => v.int("limit", Number.NaN, { min: 1, max: 25 })).toThrow(ValidationError);
  });

  it("uuidList", () => {
    expect(v.uuidList("bizIds", ["123e4567-e89b-12d3-a456-426614174000"])).toHaveLength(1);
    expect(() => v.uuidList("bizIds", ["nope"])).toThrow(ValidationError);
    expect(() => v.uuidList("bizIds", "x")).toThrow(ValidationError);
  });

  it("digits", () => {
    expect(v.digits("messageId", "123")).toBe("123");
    expect(() => v.digits("messageId", "12a")).toThrow(ValidationError);
    expect(() => v.digits("messageId", "")).toThrow(ValidationError);
    expect(() => v.digits("messageId", 123)).toThrow(ValidationError);
  });

  it("oneOf", () => {
    expect(v.oneOf("order", "ASC", ["ASC", "DESC"] as const)).toBe("ASC");
    expect(() => v.oneOf("order", "asc", ["ASC", "DESC"] as const)).toThrow(ValidationError);
    expect(() => v.oneOf("order", 1, ["ASC", "DESC"] as const)).toThrow(ValidationError);
  });

  it("optionalString", () => {
    expect(v.optionalString("cursor", undefined)).toBeUndefined();
    expect(v.optionalString("cursor", "abc")).toBe("abc");
    expect(() => v.optionalString("cursor", "  ")).toThrow(ValidationError);
    expect(() => v.optionalString("cursor", "")).toThrow(ValidationError);
    expect(() => v.optionalString("cursor", 5)).toThrow(ValidationError);
    expect(() => v.optionalString("cursor", null)).toThrow(ValidationError);
  });
});

describe("Validator (non-strict)", () => {
  it("skips format but keeps type checks", () => {
    expect(loose.id("botId", "short")).toBe("short");
    expect(loose.int("limit", 5000, { min: 1, max: 25 })).toBe(5000);
    expect(loose.oneOf("order", "asc", ["ASC"] as const)).toBe("asc");
    expect(loose.idList("tagIds", ["bad-id"])).toEqual(["bad-id"]);
    expect(loose.uuidList("bizIds", ["nope"])).toEqual(["nope"]);
    expect(loose.digits("messageId", "12a")).toBe("12a");
    expect(() => loose.id("botId", 1)).toThrow(ValidationError);
    expect(() => loose.int("limit", "1", { min: 1, max: 2 })).toThrow(ValidationError);
    expect(() => loose.int("limit", 1.5, { min: 1, max: 2 })).toThrow(ValidationError);
    expect(() => loose.idList("tagIds", "x")).toThrow(ValidationError);
    expect(() => loose.uuidList("bizIds", [1])).toThrow(ValidationError);
    expect(() => loose.digits("messageId", 1)).toThrow(ValidationError);
    expect(() => loose.oneOf("order", 1, ["ASC"] as const)).toThrow(ValidationError);
    expect(() => loose.optionalString("cursor", " ")).toThrow(ValidationError);
  });
});
