/** Headers applied to every response. The CSP is added per request in `src/proxy.ts`. */
export function getSecurityHeaders(isProduction: boolean): { key: string; value: string }[] {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
  ];

  if (isProduction) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}

interface ContentSecurityPolicyOptions {
  nonce: string;
  isDevelopment: boolean;
  /** Additional origins the browser may call via fetch/XHR/WebSocket, e.g. the API origin. */
  connectSrc: readonly string[];
  /** Additional origins images may load from, e.g. signed document URLs. */
  imgSrc?: readonly string[];
}

/**
 * Nonce-based strict CSP for scripts. Styles allow 'unsafe-inline' because
 * Radix primitives and React set inline style attributes, which nonces cannot cover.
 * React requires 'unsafe-eval' in development only.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  connectSrc,
  imgSrc = [],
}: ContentSecurityPolicyOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", ...imgSrc],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...connectSrc],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}
