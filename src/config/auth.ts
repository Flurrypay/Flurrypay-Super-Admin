/**
 * CSRF double-submit convention: the backend sets a readable (non-HttpOnly)
 * cookie and expects its value echoed in a header on state-changing requests.
 * Session credentials themselves belong in HttpOnly cookies set by the backend.
 */
export const authConfig = {
  csrf: {
    cookieName: "csrf_token",
    headerName: "X-CSRF-Token",
  },
} as const;
