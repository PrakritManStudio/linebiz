export enum LineWebErrorCode {
  INVALID_COOKIE = "INVALID_COOKIE",
  EXPIRED_COOKIE = "EXPIRED_COOKIE",
  INVALID_PARAMETER = "INVALID_PARAMETER",
  AXIOS_ERROR = "AXIOS_ERROR",
  LOGOUT_FAILURE = "LOGOUT_FAILURE",
  NOT_FOUND = "NOT_FOUND",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export type LibErrorCode = LineWebErrorCode;

export interface LibErrorShape {
  name: "LineWebError";
  code: LineWebErrorCode;
  message: string;
  cause?: unknown; // เก็บของเดิมไว้ (AxiosError, DOMException, ฯลฯ)
  status?: number; // ถ้ามี HTTP status
  meta?: Record<string, unknown>;
}

export class LineWebError extends Error implements LibErrorShape {
  name = "LineWebError" as const;
  code: LineWebErrorCode;
  status?: number;
  meta?: Record<string, unknown>;
  cause?: unknown;

  constructor(input: Omit<LibErrorShape, "name">) {
    super(input.message);
    this.code = input.code;
    this.status = input.status;
    this.meta = input.meta;
    this.cause = input.cause;
  }
}

export function isLineWebError(error: unknown): error is LineWebError {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as any).name === "LineWebError"
  );
}
