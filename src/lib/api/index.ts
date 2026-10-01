import { authConfig } from "@/config/auth";
import { readCsrfToken } from "@/lib/auth/csrf";

import { createApiClient } from "./client";
import { getApiBaseUrl } from "./config";

/**
 * Shared client for Client Components and request-agnostic server code.
 * Server code acting on behalf of the signed-in user must use `getServerApi()`
 * from `@/lib/api/server`, which forwards the user's cookies and request ID.
 */
export const api = createApiClient({
  baseUrl: getApiBaseUrl(),
  csrf: { headerName: authConfig.csrf.headerName, getToken: readCsrfToken },
});

export { createApiClient } from "./client";
export * from "./errors";
export type * from "./types";
