export type LibErrorCode =
  | "COOKIE_EXPIRED"
  | "COOKIE_INVALID"
  | "PARAMS_INVALID"
  | "AXIOS_ERROR"
  | "LOGOUT_FAILED"
  | "NETWORK"
  | "TIMEOUT"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SERVER"
  | "UNKNOWN_ERROR";

export interface LibErrorShape {
  name: "LineWebError";
  code: LibErrorCode;
  message: string;
  cause?: unknown; // เก็บของเดิมไว้ (AxiosError, DOMException, ฯลฯ)
  status?: number; // ถ้ามี HTTP status
  meta?: Record<string, unknown>;
}

export class LineWebError extends Error implements LibErrorShape {
  name: "LineWebError" = "LineWebError";
  code: LibErrorCode;
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
