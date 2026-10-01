// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createApiClient } from "@/lib/api/client";
import {
  ApiError,
  AuthenticationError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
  ValidationError,
} from "@/lib/api/errors";

const BASE_URL = "https://api.test";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function mockFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastRequest(fetchMock: ReturnType<typeof mockFetch>, call = 0) {
  const [input, init] = fetchMock.mock.calls[call] ?? [];
  const url = input instanceof Request ? input.url : (input?.toString() ?? "");
  return { url, init: init ?? {}, headers: new Headers(init?.headers) };
}

describe("createApiClient", () => {
  it("builds versioned URLs with query params and returns parsed JSON", async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    const api = createApiClient({ baseUrl: `${BASE_URL}/`, version: "v1" });

    const result = await api.get<{ ok: boolean }>("/items", {
      query: { page: 2, status: ["a", "b"], empty: undefined },
    });

    expect(result).toEqual({ ok: true });
    const { url, init, headers } = lastRequest(fetchMock);
    expect(url).toBe(`${BASE_URL}/v1/items?page=2&status=a&status=b`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("X-Request-ID")).toMatch(/^[\w-]{8,}$/);
  });

  it("serialises JSON bodies and sets write-safety headers", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));
    const api = createApiClient({
      baseUrl: BASE_URL,
      csrf: { headerName: "X-CSRF-Token", getToken: () => "csrf-value" },
      auth: { getAccessToken: () => "access-token" },
    });

    const result = await api.post("/items", { name: "x" }, { idempotencyKey: "key-1" });

    expect(result).toBeUndefined();
    const { init, headers } = lastRequest(fetchMock);
    expect(init.body).toBe(JSON.stringify({ name: "x" }));
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("key-1");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-value");
    expect(headers.get("Authorization")).toBe("Bearer access-token");
  });

  it("rejects absolute URLs so credentials cannot leak to other origins", async () => {
    const api = createApiClient({ baseUrl: BASE_URL });
    await expect(api.get("https://evil.test/steal")).rejects.toThrow(TypeError);
    await expect(api.get("//evil.test/steal")).rejects.toThrow(TypeError);
  });

  it("maps 422 responses to ValidationError with field errors and the server request ID", async () => {
    mockFetch(
      jsonResponse(
        {
          message: "Invalid input",
          errors: { email: "Email is taken" },
          requestId: "req-12345678",
        },
        { status: 422 },
      ),
    );
    const api = createApiClient({ baseUrl: BASE_URL });

    const error = await api.post("/items", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as ValidationError;
    expect(validationError.fieldErrors).toEqual({ email: ["Email is taken"] });
    expect(validationError.userMessage).toBe("Invalid input");
    expect(validationError.requestId).toBe("req-12345678");
  });

  it("never surfaces server error messages from 5xx responses to users", async () => {
    mockFetch(jsonResponse({ message: "db connection pool exhausted" }, { status: 500 }));
    const api = createApiClient({ baseUrl: BASE_URL });

    const error = await api.get("/items").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(500);
    expect((error as ApiError).userMessage).not.toContain("db connection");
    expect((error as ApiError).message).toContain("db connection");
  });

  it("refreshes the session once on 401 and retries with the same request ID", async () => {
    const fetchMock = mockFetch(
      jsonResponse({ message: "expired" }, { status: 401 }),
      jsonResponse({ ok: true }),
    );
    const refreshSession = vi.fn().mockResolvedValue(true);
    const api = createApiClient({ baseUrl: BASE_URL, auth: { refreshSession } });

    await expect(api.get("/me")).resolves.toEqual({ ok: true });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(lastRequest(fetchMock, 1).headers.get("X-Request-ID")).toBe(
      lastRequest(fetchMock, 0).headers.get("X-Request-ID"),
    );
  });

  it("notifies onUnauthorized when refresh fails", async () => {
    mockFetch(jsonResponse({ message: "expired" }, { status: 401 }));
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: BASE_URL,
      auth: { refreshSession: () => Promise.resolve(false), onUnauthorized },
    });

    await expect(api.get("/me")).rejects.toBeInstanceOf(AuthenticationError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("wraps transport failures in NetworkError", async () => {
    mockFetch(new TypeError("fetch failed"));
    const api = createApiClient({ baseUrl: BASE_URL });
    await expect(api.get("/items")).rejects.toBeInstanceOf(NetworkError);
  });

  it("raises TimeoutError when the timeout elapses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      ),
    );
    const api = createApiClient({ baseUrl: BASE_URL });
    await expect(api.get("/slow", { timeoutMs: 10 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("rethrows the caller's AbortError on cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    mockFetch(new DOMException("The operation was aborted.", "AbortError"));
    const api = createApiClient({ baseUrl: BASE_URL });

    const error = await api.get("/items", { signal: controller.signal }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  it("validates responses against a schema when provided", async () => {
    mockFetch(jsonResponse({ id: 1 }), jsonResponse({ id: "a" }));
    const api = createApiClient({ baseUrl: BASE_URL });
    const schema = z.object({ id: z.number() });

    await expect(api.get("/items/1", { schema })).resolves.toEqual({ id: 1 });
    await expect(api.get("/items/1", { schema })).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});

describe("error serialisation", () => {
  it("exposes stable names and omits details from log output", () => {
    const error = new ApiError({
      code: "HTTP_500",
      message: "boom",
      userMessage: "Something went wrong.",
      statusCode: 500,
      details: { secret: "value" },
      requestId: "req-12345678",
    });

    expect(error.name).toBe("ApiError");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "ApiError",
      code: "HTTP_500",
      message: "boom",
      statusCode: 500,
      requestId: "req-12345678",
    });
  });
});
