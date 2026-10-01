export type FieldErrors = Record<string, string[]>;

interface AppErrorOptions {
  code: string;
  /** Developer-facing description. May contain upstream detail; never render it. */
  message: string;
  /** Safe to show to end users. */
  userMessage: string;
  statusCode?: number;
  details?: unknown;
  requestId?: string;
  cause?: unknown;
}

const GENERIC_USER_MESSAGE = "Something went wrong. Please try again.";

/**
 * Base class for every error the application raises deliberately.
 * `message` is for logs and debugging; `userMessage` is the only text UI code should display.
 */
export class AppError extends Error {
  // Explicit names survive minification, unlike `constructor.name`.
  override readonly name: string = "AppError";
  readonly code: string;
  readonly userMessage: string;
  readonly statusCode: number | undefined;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor({
    code,
    message,
    userMessage,
    statusCode,
    details,
    requestId,
    cause,
  }: AppErrorOptions) {
    super(message, { cause });
    this.code = code;
    this.userMessage = userMessage;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
  }

  /** Log-safe representation. `details` is omitted because upstream payloads may contain sensitive data. */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      requestId: this.requestId,
    };
  }
}

/** The API responded with a non-success status not covered by a more specific class. */
export class ApiError extends AppError {
  override readonly name: string = "ApiError";
  declare readonly statusCode: number;
}

/** Input was rejected, either by a client-side schema or by the API (400/422). */
export class ValidationError extends AppError {
  override readonly name: string = "ValidationError";
  readonly fieldErrors: FieldErrors;

  constructor(
    options: Omit<AppErrorOptions, "code"> & { code?: string; fieldErrors?: FieldErrors },
  ) {
    super({ ...options, code: options.code ?? "VALIDATION_ERROR" });
    this.fieldErrors = options.fieldErrors ?? {};
  }
}

/** The request lacked valid credentials (401). */
export class AuthenticationError extends AppError {
  override readonly name: string = "AuthenticationError";
}

/** The caller is authenticated but not permitted to perform the action (403). */
export class AuthorizationError extends AppError {
  override readonly name: string = "AuthorizationError";
}

/** The request never produced an HTTP response (offline, DNS, CORS, connection reset). */
export class NetworkError extends AppError {
  override readonly name: string = "NetworkError";
}

/** The request exceeded its configured timeout. */
export class TimeoutError extends NetworkError {
  override readonly name: string = "TimeoutError";
}

/** The API responded successfully but the payload did not match the expected schema. */
export class UnexpectedResponseError extends AppError {
  override readonly name: string = "UnexpectedResponseError";
}

/** Anything thrown that is not an AppError. */
export class UnknownError extends AppError {
  override readonly name: string = "UnknownError";
}

const DEFAULT_USER_MESSAGES: Record<number, string> = {
  400: "The request could not be processed. Please check your input.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource could not be found.",
  409: "This action conflicts with the current state. Please refresh and try again.",
  422: "Some fields are invalid. Please review and try again.",
  429: "Too many requests. Please wait a moment and try again.",
};

export function defaultUserMessageForStatus(statusCode: number): string {
  return DEFAULT_USER_MESSAGES[statusCode] ?? GENERIC_USER_MESSAGE;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Normalises any thrown value into an AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  return new UnknownError({
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Non-error value thrown",
    userMessage: GENERIC_USER_MESSAGE,
    cause: error,
  });
}

/** Returns text that is always safe to render, regardless of what was thrown. */
export function getUserMessage(error: unknown): string {
  return toAppError(error).userMessage;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof AppError && error.statusCode === 404;
}
