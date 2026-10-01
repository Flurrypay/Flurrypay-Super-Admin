import { env } from "@/env";

export const apiConfig = {
  /** Default request timeout. Long-running operations should pass `timeoutMs` explicitly. */
  timeoutMs: 30_000,
  /** API version path segment, e.g. "v1". `null` while the API is unversioned. */
  version: null as string | null,
} as const;

/**
 * The server may reach the API on an internal address, while the browser must
 * use the public one. `API_URL` is server-only and never shipped to the client.
 */
export function getApiBaseUrl(): string {
  return typeof window === "undefined" ? env.API_URL : env.NEXT_PUBLIC_API_URL;
}
