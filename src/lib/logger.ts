import "server-only";

import pino from "pino";

import { env } from "@/env";

/**
 * Keys whose values are masked wherever they appear at the top level or one
 * level deep. Prefer never passing sensitive data to the logger at all;
 * redaction is a safety net, not a licence.
 */
const SENSITIVE_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "pin",
  "otp",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "apiKey",
  "secret",
  "clientSecret",
  "authorization",
  "cookie",
  "set-cookie",
  "cardNumber",
  "pan",
  "cvv",
  "cvc",
  "expiry",
  "accountNumber",
  "bvn",
  "nin",
  "ssn",
];

const redactPaths = SENSITIVE_KEYS.flatMap((key) => {
  const accessor = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
  const separator = accessor.startsWith("[") ? "" : ".";
  return [accessor, `*${separator}${accessor}`];
});

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "flurrypay-admin", env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: { paths: redactPaths, censor: "[REDACTED]" },
});

/** Child logger bound to a correlation ID so every line from one request can be joined. */
export function getRequestLogger(requestId: string) {
  return logger.child({ requestId });
}
