import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";

const base = `${adminPaths.core}/security`;

/**
 * Starts 2FA enrolment. Only offered while 2FA is off: older API versions
 * replace an active secret without asking for the current code, and the
 * hardened API refuses (docs/03-gaps-and-security.md S2).
 */
export function startTotpEnrolment() {
  return adminApi.post(`${base}/setup-2fa`, undefined, {
    schema: z.object({ secret: z.string(), otpauth: z.string() }),
  });
}

export function confirmTotpEnrolment(code: string) {
  return adminApi.post(`${base}/verify-2fa-setup`, { code });
}

export function disableTotp(input: { code: string; pin: string }) {
  return adminApi.post(`${base}/disable-2fa`, input);
}

export function setTransactionPin(input: { pin: string; confirmPin: string }) {
  return adminApi.post(`${base}/set-pin`, input);
}

export function changeTransactionPin(input: {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}) {
  return adminApi.post(`${base}/change-pin`, input);
}

/** Replaces the admin's recovery codes; the plaintext codes are returned once. */
export function generateRecoveryCodes(twoFACode: string) {
  return adminApi.post(
    `${base}/recovery-codes`,
    { twoFACode },
    {
      schema: z.object({ codes: z.array(z.string()).min(1) }),
    },
  );
}

/* ─── Step-up grants ─────────────────────────────────────────────────────── */

/**
 * Exchanges one authenticator code for a short-lived step-up grant.
 *
 * A TOTP code is valid for one 30-second window, so it cannot carry an
 * operation that makes a request per customer — the code has rotated long
 * before a bulk run finishes. The grant is what the API accepts in its place:
 * five minutes, signed, and bound to the current session, so it dies when the
 * session does. Single actions keep sending the code directly; only the bulk
 * paths need this.
 */
export function startStepUp(twoFACode: string) {
  return adminApi.post(
    `${base}/step-up`,
    { twoFACode },
    { schema: z.object({ grant: z.string().min(1), expiresAt: z.string() }) },
  );
}

/** Header the API reads a step-up grant from. */
export const STEP_UP_HEADER = "X-Step-Up-Grant";
