/**
 * Correlation ID propagated Browser → Next.js → API. It carries no user data;
 * it only lets a single request be traced across logs.
 */
export const REQUEST_ID_HEADER = "X-Request-ID";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function createRequestId(): string {
  return crypto.randomUUID();
}

/** Accepts an inbound ID only if it is a bounded, header-safe token; otherwise returns null. */
export function sanitizeRequestId(value: string | null | undefined): string | null {
  return value && REQUEST_ID_PATTERN.test(value) ? value : null;
}
