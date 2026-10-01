import "server-only";

import { cookies, headers } from "next/headers";

import { authConfig } from "@/config/auth";
import { env } from "@/env";
import { REQUEST_ID_HEADER, sanitizeRequestId } from "@/lib/request-id";

import { createApiClient } from "./client";
import type { ApiClient } from "./types";

/**
 * Per-request API client for Server Components, Route Handlers and Server Actions.
 * Forwards the incoming session cookie so the API authenticates the same user,
 * and propagates the correlation ID assigned in `src/proxy.ts`.
 */
export async function getServerApi(): Promise<ApiClient> {
  const [incoming, cookieStore] = await Promise.all([headers(), cookies()]);
  const cookie = incoming.get("cookie");
  const requestId = sanitizeRequestId(incoming.get(REQUEST_ID_HEADER));

  return createApiClient({
    baseUrl: env.API_URL,
    headers: cookie ? { cookie } : undefined,
    requestId: requestId ?? undefined,
    csrf: {
      headerName: authConfig.csrf.headerName,
      getToken: () => cookieStore.get(authConfig.csrf.cookieName)?.value ?? null,
    },
  });
}
