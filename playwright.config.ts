import { defineConfig, devices } from "@playwright/test";

import { API_ORIGIN } from "./tests/e2e/mock-api";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs against a production build so headers, CSP and bundling match deployment.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Pinned to the origin `tests/e2e/mock-api.ts` intercepts, so the suite never
    // reaches the live API that `.env.production` / `.env.local` point at. The CSP
    // in `src/proxy.ts` is built from this value, so it must match exactly.
    env: {
      API_URL: API_ORIGIN,
      NEXT_PUBLIC_API_URL: API_ORIGIN,
      NEXT_PUBLIC_PREVIEW_MODE: "false",
    },
  },
});
