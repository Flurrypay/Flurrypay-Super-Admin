/**
 * Mount points of the FlurryPay API's admin routers (api/src/app/app.ts).
 * Kept in one place so a backend re-mount is a one-line change.
 */
export const adminPaths = {
  core: "/flurrypay-website-admin",
  financial: "/flurrypay-website-admin-financial",
  /** Company crypto reserves: balances, deposit addresses, withdrawals. */
  wallet: "/flurrypay-website-admin-wallet",
  notifications: "/flurrypay-website-admin-notifications",
  stranded: "/flurrypay-website-admin-stranded",
  compliance: "/flurrypay-website-admin-compliance",
  risk: "/flurrypay-website-admin-risk",
  /** Appeals and contact-us messages, merged into one inbox by the API. */
  support: "/flurrypay-website-admin-support",
  /** Live support chat. Mounted twice by the API; this is the admin-guarded copy. */
  chat: "/flurrypay-website-admin-chat",
  ledger: "/flurrypay-website-admin-ledger",
  companyDetails: "/company-details",
  users: "/user",
  kyc: "/kyc/admin",
  transactions: "/transactions/admin",
} as const;
