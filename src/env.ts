import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** In production, service URLs must use HTTPS unless they point at a loopback interface. */
const serviceUrl = z.url().refine(
  (value) => {
    if (process.env.NODE_ENV !== "production") return true;
    const url = new URL(value);
    return url.protocol === "https:" || LOOPBACK_HOSTS.has(url.hostname);
  },
  { message: "Must use https:// in production" },
);

/**
 * Preview mode runs the console on built-in sample data with no API and no
 * sign-in. It is on by default for `npm run dev` and off for production
 * builds; set NEXT_PUBLIC_PREVIEW_MODE to override either way.
 */
const previewDefault = process.env.NODE_ENV === "development" ? "true" : "false";
const previewRequested = (process.env.NEXT_PUBLIC_PREVIEW_MODE ?? previewDefault) === "true";

/**
 * Outside production (or in preview, which never calls it), API URLs fall back
 * to a local API so the app starts without a .env file. Production builds
 * against the real API still require them explicitly.
 */
const LOCAL_API_URL = "http://localhost:4000";
const apiUrl =
  process.env.NODE_ENV === "production" && !previewRequested
    ? serviceUrl
    : serviceUrl.default(LOCAL_API_URL);

/**
 * Single source of truth for environment variables.
 *
 * Server variables are only readable on the server; accessing them from client
 * code throws. Client variables must be prefixed with NEXT_PUBLIC_ and are
 * inlined into the browser bundle at build time — never place secrets there.
 */
export const env = createEnv({
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  server: {
    API_URL: apiUrl,
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  },
  client: {
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_PREVIEW_MODE: z
      .enum(["true", "false"])
      .default(previewDefault)
      .transform((value) => value === "true"),
  },
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_PREVIEW_MODE: process.env.NEXT_PUBLIC_PREVIEW_MODE,
  },
  emptyStringAsUndefined: true,
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "true" ||
    // `next typegen` (run by lint and typecheck) loads next.config.ts but never reads these values.
    process.argv.includes("typegen"),
});
