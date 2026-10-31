import { ValidationError } from "./errors.js";

const ID_RE = /^[A-Za-z0-9]{33}$/;
const ID_LIST_ITEM_RE = /^[A-Za-z0-9_-]+$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DIGITS_RE = /^[0-9]+$/;

function fail(param: string, value: unknown, reason: string): never {
  throw new ValidationError({ param, value, reason });
}

function requireString(param: string, value: unknown): string {
  if (typeof value !== "string") return fail(param, value, "must be a string");
  return value;
}

function requireStringArray(param: string, value: unknown): string[] {
  if (!Array.isArray(value)) return fail(param, value, "must be an array of strings");
  const items = value as unknown[];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") return fail(param, value, "must be an array of strings");
    out.push(item);
  }
  return out;
}

/**
 * Validates method arguments and returns the checked value.
 *
 * In strict mode format, range and enum rules are enforced. In non-strict mode
 * only basic type checks (string, string array, integer, non-empty string) run.
 */
export class Validator {
  readonly #strict: boolean;

  /** @param strict Whether to enforce format, range and enum rules (`validate` client option). */
  constructor(strict: boolean) {
    this.#strict = strict;
  }

  /**
   * Validates a 33-character alphanumeric ID (botId, chatId, userId).
   * @param param Parameter name used in the error.
   * @param value Value to check.
   * @returns The validated ID.
   */
  id(param: string, value: unknown): string {
    const str = requireString(param, value);
    if (this.#strict && !ID_RE.test(str)) {
      return fail(param, value, "must be a 33-character alphanumeric ID");
    }
    return str;
  }

  /**
   * Validates an array of IDs made of letters, digits, hyphens and underscores (tagIds).
   * @param param Parameter name used in the error.
   * @param value Value to check.
   * @returns The validated list.
   */
  idList(param: string, value: unknown): string[] {
    const items = requireStringArray(param, value);
    if (this.#strict && !items.every((item) => ID_LIST_ITEM_RE.test(item))) {
      return fail(
        param,
        value,
        "must contain only IDs of letters, digits, hyphens and underscores",
      );
    }
    return items;
  }

  /**
   * Validates an array of UUID strings (bizIds).
   * @param param Parameter name used in the error.
   * @param value Value to check.
   * @returns The validated list.
   */
  uuidList(param: string, value: unknown): string[] {
    const items = requireStringArray(param, value);
    if (this.#strict && !items.every((item) => UUID_RE.test(item))) {
      return fail(param, value, "must contain only UUIDs");
    }
    return items;
  }

  /**
   * Validates a string of decimal digits (messageId, timestamp).
   * @param param Parameter name used in the error.
   * @param value Value to check.
   * @returns The validated string.
   */
  digits(param: string, value: unknown): string {
    const str = requireString(param, value);
    if (this.#strict && !DIGITS_RE.test(str)) {
      return fail(param, value, "must contain only digits");
    }
    return str;
  }

  /**
   * Validates an integer within an inclusive range.
   * @param param Parameter name used in the error.
   * @param value Value to check.
   * @param range Inclusive `min` and `max` (enforced in strict mode only).
   * @returns The validated integer.
   */
  int(param: string, value: unknown, range: { min: number; max: number }): number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return fail(param, value, "must be an integer");
    }
    if (this.#strict && (value < range.min || value > range.max)) {
      return fail(param, value, `must be between ${String(range.min)} and ${String(range.max)}`);
    }
    return value;
  }

  /**
   * Validates that a string is one of the allowed values.
   * @param param Parameter name used in the error.
   * @param value Value to check.
   * @param allowed Allowed values (enforced in strict mode only).
   * @returns The validated value.
   */
  oneOf<const T extends string>(param: string, value: unknown, allowed: readonly T[]): T {
    const str = requireString(param, value);
    if (this.#strict && !allowed.includes(str as T)) {
      return fail(param, value, `must be one of: ${allowed.join(", ")}`);
    }
    return str as T;
  }

  /**
   * Validates an optional non-empty string (cursor, query).
   * @param param Parameter name used in the error.
   * @param value Value to check.
   * @returns The string, or `undefined` when the value is `undefined`.
   */
  optionalString(param: string, value: unknown): string | undefined {
    if (value === undefined) return undefined;
    const str = requireString(param, value);
    if (str.trim() === "") return fail(param, value, "must not be empty");
    return str;
  }
}
