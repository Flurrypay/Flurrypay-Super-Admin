import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";

import { ADMIN_ROLES } from "./permissions";

const base = adminPaths.core;

/* ─── Login state machine ────────────────────────────────────────────────── */

const loginStepSchema = z.union([
  z
    .object({ token: z.string().min(1) })
    .transform((v) => ({ kind: "authenticated" as const, ...v })),
  z
    .object({ requiresPasswordReset: z.literal(true), email: z.string() })
    .transform((v) => ({ kind: "password-reset" as const, email: v.email })),
  z
    .object({ requires2FA: z.literal(true), email: z.string() })
    .transform((v) => ({ kind: "totp" as const, email: v.email })),
  z
    .object({
      onboardingRequired: z.literal(true),
      email: z.string(),
      needs2FA: z.boolean(),
      needsPhone: z.boolean(),
      onboardingToken: z.string(),
    })
    .transform((v) => ({ kind: "onboarding" as const, ...v })),
  z
    .object({
      requiresDeviceVerification: z.literal(true),
      email: z.string(),
      challengeToken: z.string(),
    })
    .transform((v) => ({ kind: "device-challenge" as const, ...v })),
  z.object({ message: z.string() }).transform(() => ({ kind: "email-code" as const })),
]);

export type LoginStep = z.output<typeof loginStepSchema>;

/** Step 1 — password. On success the API emails a one-time login code. */
export function submitPassword(input: { email: string; password: string }) {
  return adminApi.post(`${base}/login`, input, { schema: loginStepSchema, skipAuth: true });
}

/** Step 2 — the emailed code. */
export function submitEmailCode(input: { email: string; code: string }) {
  return adminApi.post(`${base}/verify-login`, input, { schema: loginStepSchema, skipAuth: true });
}

export function resendEmailCode(email: string) {
  return adminApi.post(`${base}/resend-login-code`, { email }, { skipAuth: true });
}

/** Step 3 — authenticator app code, when 2FA is enabled. */
/** Accepts either the authenticator code or a single-use recovery code. */
export function submitTotp(
  input: { email: string; twoFaCode: string } | { email: string; recoveryCode: string },
) {
  return adminApi.post(`${base}/verify-2fa-login`, input, {
    schema: loginStepSchema,
    skipAuth: true,
  });
}

/* ─── First-login onboarding (invited staff) ─────────────────────────────── */

const onboardingStateSchema = z.object({
  onboardingToken: z.string(),
  needs2FA: z.boolean(),
  needsPhone: z.boolean(),
});

export function completeForcedPasswordReset(input: {
  email: string;
  temporaryPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}) {
  return adminApi.post(`${base}/onboarding/reset-password`, input, {
    schema: onboardingStateSchema,
    skipAuth: true,
  });
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const totpEnrolmentSchema = z.object({ secret: z.string(), otpauth: z.string() });

export function startOnboardingTotp(onboardingToken: string) {
  return adminApi.post(`${base}/onboarding/setup-2fa`, undefined, {
    schema: totpEnrolmentSchema,
    headers: bearer(onboardingToken),
    skipAuth: true,
  });
}

const onboardingProgressSchema = z.object({ onboardingComplete: z.boolean().catch(false) });

/** Neither onboarding step issues a session; once complete, the admin signs in again. */
export function confirmOnboardingTotp(onboardingToken: string, code: string) {
  return adminApi.post(
    `${base}/onboarding/verify-2fa-setup`,
    { code },
    {
      schema: onboardingProgressSchema,
      headers: bearer(onboardingToken),
      skipAuth: true,
    },
  );
}

export function sendOnboardingPhoneOtp(onboardingToken: string, phoneNumber: string) {
  return adminApi.post(
    `${base}/onboarding/phone/send-otp`,
    { phoneNumber },
    {
      headers: bearer(onboardingToken),
      skipAuth: true,
    },
  );
}

export function verifyOnboardingPhoneOtp(onboardingToken: string, otp: string) {
  return adminApi.post(
    `${base}/onboarding/phone/verify-otp`,
    { otp },
    {
      schema: onboardingProgressSchema,
      headers: bearer(onboardingToken),
      skipAuth: true,
    },
  );
}

/* ─── New-device challenge ───────────────────────────────────────────────── */

export function sendDeviceChallengeSms(challengeToken: string) {
  return adminApi.post(`${base}/device-challenge/phone/send-otp`, undefined, {
    schema: z.object({ message: z.string() }),
    headers: bearer(challengeToken),
    skipAuth: true,
  });
}

export function verifyDeviceChallenge(
  challengeToken: string,
  input: { emailCode: string; phoneOtp: string; twoFaCode?: string },
) {
  return adminApi.post(`${base}/device-challenge/verify`, input, {
    schema: z.object({ token: z.string().min(1) }),
    headers: bearer(challengeToken),
    skipAuth: true,
  });
}

/* ─── Current administrator ──────────────────────────────────────────────── */

const currentAdminSchema = z
  .object({
    adminDetails: z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
      userName: z.string().nullish(),
      role: z.enum(ADMIN_ROLES),
      permissions: z.array(z.string()).catch([]),
      hasActivated2FA: z.boolean(),
      pinIsSet: z.boolean(),
      phoneNumber: z.string().nullish(),
      trustedDeviceCount: z.number(),
      recoveryCodesRemaining: z.number().catch(0),
      customRoleId: z.string().nullish().catch(null),
      lastLoginAt: z.string().nullish().catch(null),
    }),
  })
  .transform((v) => v.adminDetails);

export type CurrentAdmin = z.output<typeof currentAdminSchema>;

export function fetchCurrentAdmin(signal?: AbortSignal) {
  return adminApi.get(`${base}/details`, { schema: currentAdminSchema, signal });
}

export function signOut() {
  return adminApi.post(`${base}/logout`);
}

/** Renews the session token (the API caps total session length at 12 hours from sign-in). */
export function refreshSessionToken() {
  return adminApi.post(`${base}/session/refresh`, undefined, {
    schema: z.object({ token: z.string().min(1), maxAgeEndsAt: z.string().nullish() }),
  });
}
