"use client";

import { PREVIEW_MODE } from "@/config/preview";
import { env } from "@/env";
import { type SessionEndReason, sessionStore } from "@/features/auth/session";
import { previewFetch } from "@/preview/preview-fetch";

import { createApiClient } from "./client";
import type { AppError } from "./errors";

/**
 * API error codes (api/src/core/middlewares/auth.ts) that mean the session is
 * over. Step-up failures (wrong password, PIN or 2FA code) also use HTTP 401 but
 * carry other codes and must never sign the admin out.
 */
const SESSION_END_CODES: Record<string, SessionEndReason> = {
  NO_TOKEN: "expired",
  INVALID_FORMAT: "expired",
  INVALID_TOKEN: "expired",
  INVALID_PAYLOAD: "expired",
  MISSING_INFO: "expired",
  TOKEN_EXPIRED: "expired",
  ADMIN_NOT_FOUND: "terminated",
  SESSION_TERMINATED: "terminated",
  DEVICE_MISMATCH: "device",
  ADMIN_SUSPENDED: "suspended",
};

function handleError(error: AppError) {
  const reason = SESSION_END_CODES[error.code];
  if (reason && sessionStore.getState().session) sessionStore.end(reason);
}

/** Client for the FlurryPay admin API, authenticated with the current session. */
export const adminApi = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  // The API binds staff sessions to an HttpOnly device cookie on its own domain.
  credentials: "include",
  auth: { getAccessToken: () => sessionStore.getToken() },
  onError: handleError,
  // Preview mode answers from built-in sample data; nothing reaches the network.
  fetch: PREVIEW_MODE ? previewFetch : undefined,
});
