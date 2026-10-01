/**
 * Mount points of the FlurryPay API's admin routers (api/src/app/app.ts).
 * Kept in one place so a backend re-mount is a one-line change.
 */
export const adminPaths = {
  core: "/flurrypay-website-admin",
  financial: "/flurrypay-website-admin-financial",
  notifications: "/flurrypay-website-admin-notifications",
  stranded: "/flurrypay-website-admin-stranded",
  compliance: "/flurrypay-website-admin-compliance",
  risk: "/flurrypay-website-admin-risk",
  companyDetails: "/company-details",
  users: "/user",
  kyc: "/kyc/admin",
  transactions: "/transactions/admin",
} as const;
