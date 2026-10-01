import type { z } from "zod";

import type { AppError, AuthenticationError } from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryPrimitive | readonly QueryPrimitive[]>;

type MaybePromise<T> = T | Promise<T>;

export interface RequestOptions<T = unknown> extends Omit<
  RequestInit,
  "method" | "body" | "headers" | "signal"
> {
  /** Serialised into the query string; `null`/`undefined` values are omitted. */
  query?: QueryParams;
  headers?: HeadersInit;
  /** Cancels the request. The original AbortError is rethrown on cancellation. */
  signal?: AbortSignal;
  /** Overrides the client default timeout. */
  timeoutMs?: number;
  /** Correlation ID; generated when omitted. */
  requestId?: string;
  /** Sent as `Idempotency-Key` so the API can safely deduplicate retried writes. */
  idempotencyKey?: string;
  /** Overrides the client default API version segment. `null` disables versioning. */
  version?: string | null;
  /** Validates and types the response body at runtime. */
  schema?: z.ZodType<T>;
  /** Omits credentials handling (bearer token and session refresh) for public endpoints. */
  skipAuth?: boolean;
  /** "blob" returns the raw body (file downloads); the schema is not applied. */
  responseType?: "json" | "blob";
}

export interface RequestOptionsWithBody<T = unknown> extends RequestOptions<T> {
  /**
   * FormData, URLSearchParams, Blob and binary buffers are sent as-is;
   * every other value is JSON-encoded.
   */
  body?: unknown;
}

export interface ApiClientAuth {
  /** Returns a bearer token, when the API uses header-based auth. Cookie-based sessions need nothing here. */
  getAccessToken?: () => MaybePromise<string | null | undefined>;
  /** Attempts to renew the session after a 401. Resolve `true` if the request should be retried. */
  refreshSession?: () => Promise<boolean>;
  /**
   * Invoked when a request remains unauthorised after any refresh attempt.
   * Receives the error so callers can distinguish an ended session from a
   * rejected step-up credential, which some APIs also report as 401.
   */
  onUnauthorized?: (error: AuthenticationError) => void;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Path segment inserted between the base URL and the request path, e.g. "v1". */
  version?: string | null;
  timeoutMs?: number;
  /** Correlation ID applied to every request, e.g. the inbound request's ID on the server. */
  requestId?: string;
  /** Defaults to "include" so HttpOnly session cookies are sent to the API. */
  credentials?: RequestCredentials;
  /** Headers added to every request (e.g. forwarded cookies on the server). */
  headers?: HeadersInit | (() => MaybePromise<HeadersInit>);
  auth?: ApiClientAuth;
  /** Replaces the global fetch, e.g. to serve responses without a network (preview mode). */
  fetch?: typeof fetch;
  /** Observes every error response before it is thrown, e.g. to end a revoked session. */
  onError?: (error: AppError) => void;
  /** CSRF token echoed in a header on state-changing requests. */
  csrf?: {
    headerName: string;
    getToken: () => string | null;
  };
}

export interface ApiClient {
  request<T>(method: HttpMethod, path: string, options?: RequestOptionsWithBody<T>): Promise<T>;
  get<T>(path: string, options?: RequestOptions<T>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T>;
  delete<T>(path: string, options?: RequestOptions<T>): Promise<T>;
}
