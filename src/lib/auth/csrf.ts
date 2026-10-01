import { authConfig } from "@/config/auth";

/** Reads the CSRF token from its (intentionally non-HttpOnly) cookie. Browser only. */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${authConfig.csrf.cookieName}=`;
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}
