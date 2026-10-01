# Admin console architecture

How the console is built on top of the existing FlurryPay API, and the conventions to follow when extending it. Read `01`–`03` first for the database, the API and the known gaps.

## Modules

Each module exists because the API exposes data for it. The "UI rule" decides what appears in the navigation and whether a deep link renders. Only the "API enforces" column is a security boundary, and it describes the API branch `admin-console-hardening`: against the current production API most of these routes accept any signed-in admin (see `03-gaps-and-security.md`).

| Module             | Route                                                                   | Main endpoints                                                                                                                                                                          | UI rule                                                                                                     | API enforces (branch)                                                                                        |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Overview           | `/`                                                                     | transaction counts, KYC queue, users report, stranded summary, compliance, risk                                                                                                         | signed in (sections per permission)                                                                         | per section                                                                                                  |
| Reports            | `/reports`                                                              | `/reports/transactions`, `/reports/users`                                                                                                                                               | `transactions.view` or `users.view`                                                                         | same, per report                                                                                             |
| Transactions       | `/transactions`, `/transactions/[reference]`                            | `/transactions/admin/all`, `/exports`                                                                                                                                                   | `transactions.view`                                                                                         | `transactions.view`                                                                                          |
| Stranded transfers | `/operations/stranded`                                                  | `-stranded`, `-stranded/:ref/{delivered,refund}`                                                                                                                                        | `transactions.view`; resolving shown with `wallets.withdraw`                                                | same, + 2FA to resolve                                                                                       |
| Reversals          | `/operations/reversals`                                                 | `/reversal-candidates`, `/reverse-transaction`                                                                                                                                          | super admin                                                                                                 | super admin + password + 2FA                                                                                 |
| KYC review         | `/kyc`                                                                  | `/kyc/admin/list?page`, verify, reject, signed documents                                                                                                                                | `kyc.review`                                                                                                | `kyc.review`                                                                                                 |
| Compliance         | `/compliance`                                                           | `-compliance/*`                                                                                                                                                                         | `compliance.review`                                                                                         | `compliance.review`                                                                                          |
| Risk               | `/risk`                                                                 | `-risk/{overview,cases,holds}`                                                                                                                                                          | `compliance.review`                                                                                         | `compliance.review` (+ password + 2FA for holds)                                                             |
| Treasury           | `/treasury?tab=accounts\|reserves\|movements\|earnings`                 | `-financial/{payout-providers/balances,payout-providers/{sync-balance,switch},transfers,earnings}`, `-wallet/{get-wallets,sync-balances,withdrawal-limit,resolve-recipient,withdrawal}` | `treasury.view`; switching the payout account and withdrawing from a reserve are shown to super admins only | `treasury.view` on reads; super admin + 2FA to switch; `wallets.withdraw` + password + PIN + 2FA to withdraw |
| Rates              | `/rates`                                                                | `/company-details/rates`                                                                                                                                                                | `settings.manage`                                                                                           | `settings.manage` + 2FA to change                                                                            |
| Users              | `/users`, `/users/[userId]?tab=`                                        | `/users/search`, `/get-user/:id`, wallets, `-ledger/statement/:userId`, activity, statement, account controls, `credit-user`/`debit-user`                                               | `users.view`; controls need `users.manage`; manual credit and debit are shown to super admins only          | same; adjustments need super admin + password + PIN + 2FA                                                    |
| Support            | `/support?tab=inbox\|chat`                                              | `-support/*`, `-chat/admin/{rooms,room/:roomId,reply}`                                                                                                                                  | `support.reply` or `users.view` to read; the reply box needs `support.reply`                                | token today — the API does not yet gate these on `support.reply`                                             |
| Notifications      | `/notifications`                                                        | `-notifications`, `…/read/:id`, `…/read-all`                                                                                                                                            | signed in (every admin has the bell)                                                                        | token                                                                                                        |
| Audit log          | `/audit`                                                                | `-financial/audit-logs`, `/exports`                                                                                                                                                     | `auditLogs.view`                                                                                            | `auditLogs.view`                                                                                             |
| Administrators     | `/administrators`, `/administrators/[adminId]`, `/administrators/roles` | `/all`, `/create`, `/:id/*`, `/roles`                                                                                                                                                   | super admin                                                                                                 | super admin + 2FA for changes                                                                                |
| Security           | `/security`                                                             | `/details`, `/security/*`, `/security/recovery-codes`                                                                                                                                   | signed in                                                                                                   | token (+ 2FA where the action needs it)                                                                      |

User-detail tabs are also permission-aware. KYC, Transactions and Audit history only appear with the matching permission.

Treasury is four tabs because the four questions are different: what is in each account, what crypto the company holds, how money moved, and what was earned. Topping up is instructions rather than an action — no endpoint moves money into a company account, so the dialog shows the destination (a bank account number, or a deposit address and QR per network) and says plainly that a transfer has to be made. Withdrawing is an action, and resolves the destination before it will submit, because an internal send and an on-chain one are different acts with different consequences.

Two things are reachable without a nav entry. `/notifications` is opened from the bell's **View all**, and a notification's own target — recorded by the API as `entityType`/`entityId` and turned into a route by `features/notifications/api.ts` — lands directly on the customer, transaction, case, KYC review, support thread or chat the alert is about. That mapping is a whitelist: a notification's `link` is never followed as given, because notification rows are written by call sites that include webhook handlers processing third-party payloads.

## Security model

- **Session:** a bearer JWT (2 h) held in `sessionStorage` by `features/auth/session.ts`. While the admin is active, `use-session-keepalive.ts` renews it through `POST /session/refresh` when less than 15 minutes remain, up to 12 hours after sign-in. An idle tab is not renewed. Every request goes browser → API with `credentials: "include"`, so the API's HttpOnly `admin_device` cookie flows (staff device binding).
- **Session end:** `lib/api/admin-client.ts` maps API error codes to session end. `TOKEN_EXPIRED` means expired, `SESSION_TERMINATED` means signed in elsewhere, `DEVICE_MISMATCH` means an unrecognised device, and `ADMIN_SUSPENDED` means the account is suspended. The session also ends client-side at token expiry. On sign-out or session end, the whole query cache is cleared.
- **Step-up:** the API reports rejected step-up credentials as 401 too (`ADMIN_2FA_INVALID`, `ADMIN_PIN_*`, `ADMIN_PASSWORD_*`). These never end the session; `ConfirmActionDialog` attaches the message to the relevant field.
- **CSP:** a nonce-based `script-src` issued per request in `src/proxy.ts`. `connect-src` and `img-src` add only the API origin, and `img-src` also allows `res.cloudinary.com` for legacy KYC uploads.
- **Data minimisation:** every response is parsed with a Zod **allowlist** (`features/*/api.ts`). Fields not listed never enter components, caches or exports. KYC identity numbers are reduced to their last four digits at parse time, and user `bvn` and `fcmToken` are dropped.
- **Hydration:** redirects wait for `useHasHydrated()`, because during hydration React uses the server snapshot, which never has a session.

## Data flow

```text
API ──fetch──▶ adminApi (request ID, bearer token, timeout, typed errors)
             ──Zod allowlist──▶ TanStack Query cache (keys per feature)
             ──▶ feature view ──▶ DataTable / DetailList / StatusBadge / Amount / DateTime
URL (nuqs) ──▶ filters, sort, page, search, tab
```

- **Server-paged data** (transactions, users, KYC, audit, compliance alerts and reports, earnings): the query key includes every filter, and `keepPreviousData` avoids flicker.
- **Small unpaged lists** (administrators, roles, holds, cases, stranded transfers, reversal candidates): fetched whole. Risk cases are capped at 100 by the API, and the page says so when the cap is reached.
- **Amounts:** kept as exact decimal strings (`lib/api/schema-helpers.ts`) and formatted with `formatAmount` (Intl on the string, up to 8 fraction digits), with no arithmetic.
- **Time:** displayed in WAT (`config/locale.ts`) with the UTC value in a tooltip. Date filters resolve WAT calendar days to UTC instants (`components/filters/date-range.ts`).

## Conventions

- **Feature folder:** `features/<domain>/` holds `api.ts` (endpoints + schemas), `labels.ts` (status and enum vocabularies), `columns.tsx`, views and pages. App routes stay thin, wrapping `AccessGuard` and a feature view.
- **Tables:** define `DataColumn<T>[]` with an `exportValue` for exportable columns, `sensitive` for personal data, `priority` (`secondary` hidden below md, `tertiary` below xl) and `sortKey`/`sortValue`. Preferences (visibility, order, density) persist per viewer in `localStorage`.
- **Statuses:** only values that exist in the API. Each has an icon, label, tone and description (`StatusMap`); unknown values render as neutral humanised badges.
- **Sensitive actions:** always go through `ConfirmActionDialog`, stating action, target and impact, capturing a reason where the API stores one, and asking for exactly the step-up fields the endpoint's middleware reads.
- **Empty, loading and error states:** `EmptyState` explains the section, `ErrorState` shows the user-safe message plus the request ID, and `Freshness` shows when data was loaded and offers Refresh. Nothing claims to be realtime.
- **Adding a permission-gated module:** add a nav entry in `config/navigation.ts` with its `access` rule (a permission, any of several, or super admin), wrap the page in `AccessGuard`, and make sure the API route carries the matching `requirePermission`.
- **Forms in dialogs:** `ConfirmActionDialog` for one-step confirmations (reason, step-up, type-to-confirm, a required acknowledgement); `FormDialog` + `Field` for small forms such as placing a hold or changing rates.

## Exports

Exports are available from Users, Transactions, the Audit log and the KYC queue (`components/export`). Scopes are the current page, the selected rows (kept across pages) or all filtered rows.

- **All filtered rows** of users, transactions and the audit log are built by the API (`POST /exports`), as CSV or Excel, up to 100,000 rows. The API checks the dataset permission and records `DATA_EXPORTED` with the filters and columns. Table column IDs map to the API's export keys through `exportKeys`; page-only columns (completed transactions on the user list, browser) are left out of server files.
- **Page and selection** exports, and all-rows KYC exports (up to 10,000 rows, fetched in 200-row pages), are CSV files built in the browser. Formula-injection characters are neutralised and a BOM is added for Excel. These are not audited.
- The per-customer statement is generated by the API and audited (`USER_STATEMENT_DOWNLOADED`).

## Charts

Reports use `components/charts/column-chart.tsx`: stacked columns drawn as SVG, with a legend for two or more series, a tooltip reachable by pointer and arrow keys, and a table view of every value. Series colours are the `--viz-1…3` tokens in `globals.css`, a fixed-order categorical palette validated for colour-vision deficiency against the light and dark card surfaces. Slot 3 is below 3:1 contrast on the light surface, so every chart ships its table view.

## Audit model

The API writes `admin_audit_logs`: administrator, action, metadata, IP and user agent, plus (on the branch) `targetType`, `targetId`, `reason`, `requestId` and `before`/`after` snapshots. The service infers the target and reason from metadata when a caller doesn't set them. The console:

- Shows human labels for every known action, including free-form ones like `USER_ACCOUNT_FROZEN`.
- Links targets (customer, administrator, transaction, role), falling back to metadata for older entries.
- Filters by action, date range (WAT days) and target. "Show all actions on this target" narrows the list from an entry.
- Shows a field-by-field before/after table where one was recorded, and redacts secret-looking keys.

An administrator's last sign-in comes from `lastLoginAt`, or from their latest `ADMIN_LOGIN` entry for sign-ins before that column existed.

## Deployment constraints found in the API

- **CORS:** the admin console must be served from an origin the API allows. In production that is only `https://flurrypay.io` or `https://www.flurrypay.io`. Hosting at `admin.flurrypay.io` needs that origin added to `app.ts` CORS and to `adminBotGuard`.
- **Device cookie:** `admin_device` is set with `Domain=.flurrypay.io; SameSite=None; Secure`, so the console must be on a `flurrypay.io` host over HTTPS for staff device binding to work.
- **Configuration:** `API_URL` and `NEXT_PUBLIC_API_URL` are set to the public API origin
  (`https://api.flurrypay.io`) in `.env.production`, with `NEXT_PUBLIC_PREVIEW_MODE=false`. Preview
  mode defaults to `true` under `next dev`, so a dev server aimed at a real API must set it to
  `false` explicitly.
- **Bot detection:** the API instant-blocks a source IP for 6 hours on a non-browser user agent
  (`curl/`, `node-fetch`, `undici`, …). Probe it with a real browser UA, or not at all. Admin
  login and password-reset paths are exempt, so a blocked IP can still sign in; every other admin
  route returns 403 `IP_BLOCKED` until the block ages out, the process restarts, or the IP is
  cleared via `DELETE /flurrypay-website-admin/blocked-ips/:ip` or added to the API's `TRUSTED_IPS`.
- **Exports:** the API has no export endpoint. Exports are generated in the browser by walking the
  list endpoint's pages (CSV only, capped at 10,000 rows).

## Tests

- **Unit** (`tests/unit`): API client, schemas and allowlists (including admin, alert and payout-provider secrets), auth state machine, session-ending rules, CORS-safe headers, money and date formatting, CSV injection, permissions and any-of access rules, invitation state, export filters.
- **End-to-end** (`tests/e2e`): runs against a production build with the API mocked at the network layer (`mock-api.ts`, test-only fixtures). It covers sign-in, permission-aware navigation, deep-link refusal, filters in the URL, the drawer, step-up errors, keyboard shortcuts, reload persistence, session termination, bulk suspension with skipped rows, resolving a stranded transfer, and exports carrying the list filters.
