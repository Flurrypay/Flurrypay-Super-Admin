# FlurryPay Admin

Operations console for the FlurryPay platform. Administrators use it to monitor transactions and stuck transfers, review KYC, work compliance alerts and risk cases, manage customer accounts, watch treasury and pricing, audit administrator activity, and manage staff access and their own account security. It runs directly against the FlurryPay API.

## Documentation

| Document                                                           | Contents                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [`docs/01-database-domain-map.md`](docs/01-database-domain-map.md) | Schema as it really exists (models + migrations), grouped by domain        |
| [`docs/02-api-map.md`](docs/02-api-map.md)                         | Admin authentication, authorization model, endpoints used                  |
| [`docs/03-gaps-and-security.md`](docs/03-gaps-and-security.md)     | Security findings, data-accuracy findings, API and database gaps           |
| [`docs/04-admin-architecture.md`](docs/04-admin-architecture.md)   | Module map, security model, data flow, conventions, deployment constraints |

## Modules

- **Monitor:** Overview (what needs attention), Reports (transactions and sign-ups per day, with table views).
- **Operations:** Transactions (list, filters, quick view, full page, server export), Stranded transfers (resolve as delivered or refund), Reversals (super admin), KYC review (paged queue, documents, approve or reject).
- **Risk & compliance:** Compliance (alerts, customer risk profiles, suspicious activity report register), Risk (cases, evidence requests, holds).
- **Finance:** Treasury (settlement coverage, payout accounts, earnings), Rates (USD rates, markups, swap fee).
- **Customers:** Users (paged search, bulk suspend and freeze, detail with KYC, wallets, transactions, activity, audit history, account controls, statements, holds).
- **Governance:** Audit log (date and target filters, before/after changes, export), Administrators (invite, custom roles, sessions, invitations, suspend, remove).
- **Account:** Security (2FA, recovery codes, transaction PIN, session).

⌘K search across customers, wallet addresses, references and administrators, keyboard navigation, a help centre and a first-run tour are available throughout.

## API branch

Most modules rely on endpoints and permission checks added on the API branch **`admin-console-hardening`** (in `../api`, not merged or deployed). It fixes the security findings in `docs/03-gaps-and-security.md` and adds search, exports, reports, roles, invitations, session refresh and recovery codes. Read `api/docs/admin-console-hardening.md` before deploying it: staff with no permissions lose access once permissions are enforced, and several responses change for the older admin frontend.

## Stack

| Concern            | Choice                                                              |
| ------------------ | ------------------------------------------------------------------- |
| Framework          | Next.js 16 (App Router, Turbopack), React 19                        |
| Language           | TypeScript 6 (strict)                                               |
| Styling            | Tailwind CSS 4, `cva`, `clsx` + `tailwind-merge`                    |
| UI primitives      | Radix UI (`radix-ui`), Lucide icons, cmdk (search), sonner (toasts) |
| Server state       | TanStack Query 5                                                    |
| Client state       | Zustand 5                                                           |
| Forms & validation | React Hook Form, Zod 4, `@hookform/resolvers`                       |
| URL state          | nuqs                                                                |
| Environment        | `@t3-oss/env-nextjs` (Zod-validated)                                |
| Logging            | pino (server only)                                                  |
| Dates              | date-fns + `Intl` (WAT display, UTC exchange)                       |
| 2FA enrolment      | qrcode (QR generated locally)                                       |
| Testing            | Vitest, Testing Library, Playwright                                 |
| Quality            | ESLint 9 (type-aware), Prettier, Husky + lint-staged                |

## Requirements

- Node.js 24 LTS (see `.nvmrc`; ≥ 22.12 supported)
- pnpm 11 (`corepack enable` picks up the version pinned in `package.json`)

## Getting started

```bash
pnpm install
pnpm dev                     # or npm run dev → http://localhost:3000
```

No `.env.local` is needed for development: the API URLs default to `http://localhost:4000`. Copy `.env.example` to `.env.local` only to point at a different API. Production builds refuse to start without them.

Git hooks are installed by `pnpm install` once the directory is a git repository.

## Scripts

| Command             | Purpose                               |
| ------------------- | ------------------------------------- |
| `pnpm dev`          | Development server                    |
| `pnpm build`        | Production build                      |
| `pnpm start`        | Serve the production build            |
| `pnpm lint`         | ESLint (zero warnings allowed)        |
| `pnpm lint:fix`     | ESLint with autofix                   |
| `pnpm format`       | Format with Prettier                  |
| `pnpm format:check` | Verify formatting                     |
| `pnpm typecheck`    | Generate route types and run `tsc`    |
| `pnpm test`         | Unit/integration tests (Vitest)       |
| `pnpm test:watch`   | Vitest in watch mode                  |
| `pnpm test:e2e`     | Playwright against a production build |

First-time E2E setup: `pnpm exec playwright install chromium`.

For readable logs in development, pipe output through pino-pretty: `pnpm dev | pnpm dlx pino-pretty`.

## Project structure

```text
src/
├── app/                 Routes, root layout, error boundaries, /api/health
├── components/ui/       Accessible primitives (Radix-based) — no product components
├── config/              Non-secret configuration: site, locale, auth, security headers/CSP
├── hooks/               Shared React hooks (e.g. useZodForm)
├── lib/
│   ├── api/             API client, error hierarchy, types, server client
│   ├── auth/            Auth helpers (CSRF token reader)
│   ├── date.ts          UTC/ISO timestamp helpers
│   ├── logger.ts        Structured server logger with redaction
│   ├── money.ts         Integer minor-unit money helpers
│   ├── query-client.ts  TanStack Query defaults
│   ├── request-id.ts    Correlation ID helpers
│   └── validation.ts    Schema parsing and server→form error mapping
├── providers/           Client providers (Query, nuqs, Tooltip)
├── schemas/             Reusable Zod primitives
├── stores/              Zustand helpers (request-scoped stores)
├── env.ts               Typed environment variables
├── instrumentation.ts   Server error logging hook
└── proxy.ts             Per-request CSP nonce and request ID
tests/
├── unit/                Vitest
└── e2e/                 Playwright
```

Feature code should live in `src/features/<domain>/` (API functions, query hooks, schemas, components), and use the shared layers above.

## Environment variables

All variables are declared and validated in `src/env.ts`. Import `env` from `@/env`; do not read `process.env` elsewhere.

| Variable                   | Scope  | Description                                                                                        |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `API_URL`                  | Server | API base URL as reached from the Next.js server. Live: `https://api.flurrypay.io`                  |
| `NEXT_PUBLIC_API_URL`      | Client | FlurryPay API origin the console calls. Live: `https://api.flurrypay.io`                           |
| `NEXT_PUBLIC_PREVIEW_MODE` | Client | `true` serves built-in sample data with no API and no sign-in; defaults to `true` under `next dev` |
| `LOG_LEVEL`                | Server | pino level; default `info`                                                                         |
| `SKIP_ENV_VALIDATION`      | Build  | `true` to defer validation (e.g. container builds)                                                 |

`NEXT_PUBLIC_*` values are inlined into the browser bundle, so never put secrets in them. In production, both API URLs must use HTTPS.

## Running against the FlurryPay API

The console calls the API directly from the browser, with the admin bearer token and the API's
HttpOnly device cookie.

`.env.production` points production builds at the live API (`https://api.flurrypay.io`) with preview
mode off, so `pnpm build && pnpm start` needs no further configuration. `.env.local` (not committed;
copy `.env.example`) does the same for a dev server.

**Against a local API:** run it on `http://localhost:4000` — it allows `http://localhost:3000`
outside production — and point both API URLs at it.

**Against the live API from a dev server:** the live API runs with `NODE_ENV=production`, where its
CORS allowlist is exactly `https://flurrypay.io`, `https://www.flurrypay.io` and
`https://api.flurrypay.io`, and where `admin_device` is scoped to `Domain=.flurrypay.io; SameSite=None;
Secure`. A browser on `http://localhost:3000` is refused by CORS, and could not hold the device cookie
even if it were not. Reaching the live API from a dev machine therefore needs, on the API side, a
`flurrypay.io` subdomain resolving to that machine, served over HTTPS, and added to both the CORS
allowlist in `app.ts` and `adminBotGuard`. See `docs/04-admin-architecture.md`.

`pnpm check:endpoints` statically verifies that every path the console calls is served by the API
repo (`../api` by default) and is not shadowed by an earlier `:param` route.

E2E tests don't need the API: they mock it at the network layer with test-only fixtures (`tests/e2e/mock-api.ts`).

## API client

All HTTP calls go through `@/lib/api`. Don't call `fetch` directly from feature code.

```ts
import { api } from "@/lib/api";
import { z } from "zod";

const Account = z.object({ id: z.string(), status: z.string() });

// Typed and validated at runtime
const account = await api.get("/accounts/123", { schema: Account });

// Writes: JSON body, idempotency key, cancellation
await api.post("/payouts", payload, { idempotencyKey: crypto.randomUUID(), signal });
```

In Server Components, Route Handlers and Server Actions, use the per-request client. It forwards the user's session cookie and the request ID:

```ts
import { getServerApi } from "@/lib/api/server";

const api = await getServerApi();
const data = await api.get("/me");
```

Behaviour:

- **Errors** are normalised to `ValidationError` (400/422, with `fieldErrors`), `AuthenticationError` (401), `AuthorizationError` (403), `ApiError` (other statuses), `NetworkError` / `TimeoutError`, `UnexpectedResponseError` (schema mismatch). Each carries `code`, `statusCode`, `requestId`, developer `message` and a user-safe `userMessage`. Render only `userMessage` (or use `getUserMessage(error)`). For 5xx responses it never contains server text.
- **Cancellation** rethrows the caller's native `AbortError`. Timeouts (default 30 s) raise `TimeoutError`.
- **Correlation**: every request sends `X-Request-ID`. On the server it reuses the ID assigned by `src/proxy.ts`.
- **Security**: paths must be relative (absolute URLs are rejected so credentials cannot leak to other origins), and cookies are sent with `credentials: "include"`.
- **Retries**: the client never retries. TanStack Query retries queries only on network errors, 408, 429 and 5xx. Mutations are never retried automatically.
- **Versioning**: set `apiConfig.version` (e.g. `"v1"`) or pass `version` per request.

When a mutation fails with `ValidationError`, `applyFieldErrors(error, form.setError)` maps the API's field errors onto React Hook Form fields.

## Authentication

Sign-in follows the API's admin flow: password, emailed code, then an authenticator code or a recovery code (`features/auth`). New staff complete onboarding (password reset, 2FA, phone), and unrecognised devices pass a device challenge.

- **Session:** the API returns a bearer JWT. The console keeps it in `sessionStorage` (per tab, cleared when the tab closes), never in `localStorage`, and sends it on every request with `credentials: "include"`, so the API's HttpOnly device cookie binds staff sessions to their browser. Active sessions are renewed before they expire, up to 12 hours after sign-in.
- **Session end:** expired, terminated (signed in elsewhere), device-mismatch and suspended responses sign the admin out with an explanation, and the query cache is cleared. Step-up failures (wrong password, PIN or 2FA code on a sensitive action) never do.
- **Authorization:** navigation and pages follow the admin's role and permissions (`features/auth/permissions.ts`), but the API decides every request.

## Security

- **CSP:** nonce-based `script-src` with `'strict-dynamic'`, generated per request in `src/proxy.ts`. `connect-src` is limited to self and the API origin, `img-src` adds the API origin and `res.cloudinary.com` (legacy KYC uploads), and `frame-ancestors 'none'` is set.
- **Data minimisation:** every API response is parsed with an allowlist schema, so fields the console doesn't need (password hashes, identity numbers, provider credentials) never reach components, caches or exports. Pages are rendered per request so the nonce can be applied.
- **Headers** (`src/config/security.ts`): `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS in production. `X-Powered-By` is disabled.
- **Environment:** validated at build and startup. Server-only variables throw if accessed in client code, and `server-only` guards the logger and server API client.
- **Logging:** pino redacts credential, card and identity fields (`src/lib/logger.ts`). Treat redaction as a safety net, and never log sensitive values intentionally.
- **Errors:** users only ever see `userMessage`. Server Component errors reach the browser as an opaque digest, and details are logged server-side via `src/instrumentation.ts`.
- **Money:** amounts are exact decimal strings from parse to display (`src/lib/api/schema-helpers.ts`, `src/lib/format.ts`). The console never does arithmetic on them. Never use floating point for money.
- **Time:** timestamps are exchanged as UTC ISO-8601 strings, and time zones are applied explicitly only for display (`src/lib/date.ts`).
- **Dependencies:** pnpm blocks dependency lifecycle scripts unless allowed in `pnpm-workspace.yaml`, and it holds back very recently published versions (`minimumReleaseAge`).

## Deployment

- `pnpm build && pnpm start` on Node.js 24. The app renders per request (required by the CSP nonce), so a Node server is needed; static export is not supported.
- Provide environment variables at build time (`NEXT_PUBLIC_*` values are inlined) and at runtime.
- Terminate TLS in front of the app. HSTS is sent in production.
- `GET /api/health` is a liveness probe.
- For container images, consider `output: "standalone"` in `next.config.ts`.
