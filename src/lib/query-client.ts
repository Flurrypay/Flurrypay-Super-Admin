import { environmentManager, QueryClient } from "@tanstack/react-query";

import { AppError, isAbortError, NetworkError } from "@/lib/api/errors";

const MAX_QUERY_RETRIES = 2;

/** API error codes that describe a transient condition rather than a rejected request. */
const TRANSIENT_ERROR_CODES = new Set(["DEVICE_COOKIE_MISSING"]);

/**
 * Retries only failures that may be transient: network errors, 408, 429 and 5xx.
 * Client errors (400–499) are deterministic and are never retried.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES || isAbortError(error)) return false;
  if (error instanceof NetworkError) return true;
  if (error instanceof AppError && TRANSIENT_ERROR_CODES.has(error.code)) return true;
  if (error instanceof AppError && error.statusCode !== undefined) {
    return error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
  }
  return false;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoids an immediate client refetch of data just rendered on the server.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: true,
      },
      mutations: {
        // Financial writes must never be replayed automatically; retries require an idempotency key and intent.
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * A fresh client per server request prevents cache sharing between users;
 * the browser reuses one client for the lifetime of the page.
 */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
