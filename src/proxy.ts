import { type NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy } from "@/config/security";
import { env } from "@/env";
import { createRequestId, REQUEST_ID_HEADER, sanitizeRequestId } from "@/lib/request-id";

const apiOrigin = new URL(env.NEXT_PUBLIC_API_URL).origin;

/**
 * Runs before every matched request to:
 * - assign a correlation ID, forwarded to Server Components and returned to the client;
 * - issue a per-request CSP nonce, which Next.js applies to its own scripts.
 */
export function proxy(request: NextRequest) {
  const requestId = sanitizeRequestId(request.headers.get(REQUEST_ID_HEADER)) ?? createRequestId();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: env.NODE_ENV === "development",
    connectSrc: [apiOrigin],
    // KYC documents: signed URLs served by the API, and legacy Cloudinary uploads.
    imgSrc: [apiOrigin, "https://res.cloudinary.com"],
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
