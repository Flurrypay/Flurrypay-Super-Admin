import { createRequestId, REQUEST_ID_HEADER, sanitizeRequestId } from "@/lib/request-id";

import { apiConfig } from "./config";
import {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  defaultUserMessageForStatus,
  type FieldErrors,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
  ValidationError,
} from "./errors";
import type {
  ApiClient,
  ApiClientOptions,
  HttpMethod,
  QueryParams,
  RequestOptions,
  RequestOptionsWithBody,
} from "./types";

const UNSAFE_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"]);
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:/i;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const {
    baseUrl,
    version: defaultVersion = apiConfig.version,
    timeoutMs: defaultTimeoutMs = apiConfig.timeoutMs,
    requestId: defaultRequestId,
    credentials = "include",
    auth,
    csrf,
    onError,
  } = options;
  // Resolved per request so a fetch replaced later (tests, polyfills) is used.
  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  // Concurrent 401s share one refresh attempt.
  let pendingRefresh: Promise<boolean> | null = null;

  function refreshSession(): Promise<boolean> {
    if (!auth?.refreshSession) return Promise.resolve(false);
    pendingRefresh ??= auth.refreshSession().finally(() => {
      pendingRefresh = null;
    });
    return pendingRefresh;
  }

  async function buildHeaders(
    method: HttpMethod,
    requestId: string,
    body: BodyInit | undefined,
    extra: Pick<RequestOptions, "headers" | "idempotencyKey" | "skipAuth">,
  ): Promise<Headers> {
    const defaults =
      typeof options.headers === "function" ? await options.headers() : options.headers;
    const headers = new Headers(defaults);
    new Headers(extra.headers).forEach((value, key) => {
      headers.set(key, value);
    });

    headers.set(REQUEST_ID_HEADER, requestId);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (typeof body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (extra.idempotencyKey) headers.set("Idempotency-Key", extra.idempotencyKey);
    if (csrf && UNSAFE_METHODS.has(method)) {
      const csrfToken = csrf.getToken();
      if (csrfToken) headers.set(csrf.headerName, csrfToken);
    }
    if (!extra.skipAuth && auth?.getAccessToken && !headers.has("Authorization")) {
      const token = await auth.getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
  }

  async function send<T>(
    method: HttpMethod,
    path: string,
    requestOptions: RequestOptionsWithBody<T>,
    isRetry: boolean,
  ): Promise<T> {
    const {
      query,
      headers: extraHeaders,
      signal,
      timeoutMs = defaultTimeoutMs,
      requestId: providedRequestId,
      idempotencyKey,
      version = defaultVersion,
      schema,
      skipAuth,
      responseType = "json",
      body: rawBody,
      ...init
    } = requestOptions;

    const requestId = providedRequestId ?? defaultRequestId ?? createRequestId();
    const url = buildUrl(baseUrl, version, path, query);
    const body = serializeBody(rawBody);
    const headers = await buildHeaders(method, requestId, body, {
      headers: extraHeaders,
      idempotencyKey,
      skipAuth,
    });

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        credentials,
        ...init,
        method,
        headers,
        body,
        signal: combinedSignal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeoutSignal.aborted) {
        throw new TimeoutError({
          code: "TIMEOUT",
          message: `${method} ${path} timed out after ${timeoutMs}ms`,
          userMessage: "The request took too long. Please try again.",
          requestId,
          cause: error,
        });
      }
      throw new NetworkError({
        code: "NETWORK_ERROR",
        message: `${method} ${path} failed: ${error instanceof Error ? error.message : "network failure"}`,
        userMessage: "Unable to reach the server. Check your connection and try again.",
        requestId,
        cause: error,
      });
    }

    const responseRequestId =
      sanitizeRequestId(response.headers.get(REQUEST_ID_HEADER)) ?? requestId;

    if (response.status === 401 && !skipAuth && !isRetry && auth?.refreshSession) {
      if (await refreshSession()) {
        await response.body?.cancel();
        return send(method, path, { ...requestOptions, requestId }, true);
      }
    }

    if (response.ok && responseType === "blob") return (await response.blob()) as T;

    const data = await parseBody(response);

    if (!response.ok) {
      const error = createErrorFromResponse(method, path, response.status, data, responseRequestId);
      if (error instanceof AuthenticationError && !skipAuth) auth?.onUnauthorized?.(error);
      onError?.(error);
      throw error;
    }

    if (!schema) return data as T;

    const result = schema.safeParse(data);
    if (!result.success) {
      throw new UnexpectedResponseError({
        code: "UNEXPECTED_RESPONSE",
        message: `${method} ${path} returned an unexpected payload`,
        userMessage: "Received an unexpected response. Please try again.",
        statusCode: response.status,
        details: result.error.issues,
        requestId: responseRequestId,
      });
    }
    return result.data;
  }

  function request<T>(
    method: HttpMethod,
    path: string,
    requestOptions: RequestOptionsWithBody<T> = {},
  ): Promise<T> {
    return send(method, path, requestOptions, false);
  }

  return {
    request,
    get: <T>(path: string, requestOptions?: RequestOptions<T>) =>
      request<T>("GET", path, requestOptions),
    post: <T>(path: string, body?: unknown, requestOptions?: RequestOptions<T>) =>
      request<T>("POST", path, { ...requestOptions, body }),
    put: <T>(path: string, body?: unknown, requestOptions?: RequestOptions<T>) =>
      request<T>("PUT", path, { ...requestOptions, body }),
    patch: <T>(path: string, body?: unknown, requestOptions?: RequestOptions<T>) =>
      request<T>("PATCH", path, { ...requestOptions, body }),
    delete: <T>(path: string, requestOptions?: RequestOptions<T>) =>
      request<T>("DELETE", path, requestOptions),
  };
}

function buildUrl(
  baseUrl: string,
  version: string | null,
  path: string,
  query: QueryParams | undefined,
): string {
  // Rejecting absolute URLs guarantees credentials are only ever sent to the configured API.
  if (ABSOLUTE_URL_PATTERN.test(path) || path.startsWith("//")) {
    throw new TypeError(`API paths must be relative, received "${path}"`);
  }

  const segments = [baseUrl.replace(/\/+$/, "")];
  if (version) segments.push(version.replace(/^\/+|\/+$/g, ""));
  segments.push(path.replace(/^\/+/, ""));
  const url = new URL(segments.join("/"));

  for (const [key, value] of Object.entries(query ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== null && item !== undefined) url.searchParams.append(key, String(item));
    }
  }

  return url.toString();
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return body as BodyInit;
  }
  return JSON.stringify(body);
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;

  const text = await response.text();
  if (!text) return undefined;

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!/[/+]json\b/i.test(contentType)) return text;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts `{ field: "msg" }` or `{ field: ["msg", ...] }`; anything else is not a field map. */
function toFieldErrors(value: unknown): FieldErrors | undefined {
  if (!isRecord(value)) return undefined;

  const fieldErrors: FieldErrors = {};
  for (const [field, messages] of Object.entries(value)) {
    if (typeof messages === "string") fieldErrors[field] = [messages];
    else if (Array.isArray(messages) && messages.every((m) => typeof m === "string")) {
      fieldErrors[field] = messages;
    } else return undefined;
  }
  return fieldErrors;
}

function createErrorFromResponse(
  method: HttpMethod,
  path: string,
  statusCode: number,
  data: unknown,
  headerRequestId: string,
): ApiError | ValidationError | AuthenticationError | AuthorizationError {
  const body = isRecord(data) ? data : {};
  const serverMessage = typeof body.message === "string" ? body.message : undefined;
  const code = typeof body.code === "string" ? body.code : `HTTP_${statusCode}`;
  const details = body.errors ?? body.details;
  const requestId =
    typeof body.requestId === "string"
      ? (sanitizeRequestId(body.requestId) ?? headerRequestId)
      : headerRequestId;

  // Client errors carry messages the API intends for users; server errors never do.
  const userMessage =
    statusCode < 500 && serverMessage ? serverMessage : defaultUserMessageForStatus(statusCode);

  const options = {
    code,
    message: `${method} ${path} responded ${statusCode}${serverMessage ? `: ${serverMessage}` : ""}`,
    userMessage,
    statusCode,
    details,
    requestId,
  };

  switch (statusCode) {
    case 400:
    case 422:
      return new ValidationError({ ...options, fieldErrors: toFieldErrors(details) });
    case 401:
      return new AuthenticationError(options);
    case 403:
      return new AuthorizationError(options);
    default:
      return new ApiError(options);
  }
}
