/** Accepts only same-origin relative paths, so `?next=` cannot redirect off-site. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return fallback;
  if (value.startsWith("/login")) return fallback;
  return value;
}
