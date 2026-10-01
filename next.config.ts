// Validates environment variables at build and startup.
import "./src/env";

import type { NextConfig } from "next";

import { getSecurityHeaders } from "./src/config/security";

const nextConfig: NextConfig = {
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  // Compile-time checking of `<Link href>` and router navigation targets.
  typedRoutes: true,
  headers: () =>
    Promise.resolve([
      {
        source: "/:path*",
        headers: getSecurityHeaders(process.env.NODE_ENV === "production"),
      },
    ]),
};

export default nextConfig;
