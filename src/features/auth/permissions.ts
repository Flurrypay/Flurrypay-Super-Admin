/**
 * Mirror of the API's authorization model (`api/src/core/@types` AdminRole,
 * AdminPermission, STAFF_GRANTABLE_PERMISSIONS, hasPermission).
 *
 * The UI uses this to decide what to show. It is not a security boundary:
 * the API is the only place authorization can be enforced. See
 * docs/03-gaps-and-security.md (S1): the production API enforces few of these
 * until the admin-console-hardening API branch ships.
 */

export const ADMIN_ROLES = ["admin", "executive", "superAdmin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "users.view",
  "users.manage",
  "transactions.view",
  "kyc.review",
  "wallets.moveMoney",
  "wallets.withdraw",
  "referrals.view",
  "broadcasts.send",
  "support.reply",
  "settings.manage",
  "auditLogs.view",
  "treasury.view",
  "compliance.review",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type PermissionRisk = "standard" | "elevated" | "critical";

interface PermissionInfo {
  label: string;
  group: string;
  description: string;
  risk: PermissionRisk;
  /** Whether the API accepts this permission for non–super-admin staff. */
  grantable: boolean;
}

export const PERMISSION_INFO: Record<AdminPermission, PermissionInfo> = {
  "users.view": {
    label: "View users",
    group: "Users",
    description: "See customer profiles, balances, wallets and activity.",
    risk: "standard",
    grantable: true,
  },
  "users.manage": {
    label: "Manage users",
    group: "Users",
    description: "Block, suspend, freeze and manually verify customer accounts.",
    risk: "elevated",
    grantable: true,
  },
  "transactions.view": {
    label: "View transactions",
    group: "Transactions",
    description: "See the unified transaction ledger, including failures and reversals.",
    risk: "standard",
    grantable: true,
  },
  "kyc.review": {
    label: "Review KYC",
    group: "Compliance",
    description: "Approve or reject identity verification levels, which changes withdrawal limits.",
    risk: "elevated",
    grantable: true,
  },
  "wallets.moveMoney": {
    label: "Fund company wallets",
    group: "Treasury",
    description: "Move funds into company wallets and top up balances.",
    risk: "critical",
    grantable: true,
  },
  "wallets.withdraw": {
    label: "Withdraw company funds",
    group: "Treasury",
    description:
      "Move funds out: crypto withdrawals, fiat payouts, manual debits. Super admin only.",
    risk: "critical",
    grantable: false,
  },
  "referrals.view": {
    label: "View referrals",
    group: "Growth",
    description: "See referral relationships, rewards and leaderboards.",
    risk: "standard",
    grantable: true,
  },
  "broadcasts.send": {
    label: "Send broadcasts",
    group: "Growth",
    description: "Send email and push messages to customer segments.",
    risk: "elevated",
    grantable: true,
  },
  "support.reply": {
    label: "Reply to support",
    group: "Support",
    description: "Read and answer appeals and contact messages.",
    risk: "standard",
    grantable: true,
  },
  "settings.manage": {
    label: "Manage rates & settings",
    group: "Settings",
    description: "Change buy/sell rates and fees, which affects pricing for every customer.",
    risk: "critical",
    grantable: true,
  },
  "treasury.view": {
    label: "View treasury",
    group: "Treasury",
    description: "See company balances, liquidity coverage, earnings and company transfers.",
    risk: "elevated",
    grantable: true,
  },
  "compliance.review": {
    label: "Review compliance",
    group: "Compliance",
    description:
      "Work AML alerts, cases and suspicious activity reports; place and release fund holds.",
    risk: "elevated",
    grantable: true,
  },
  "auditLogs.view": {
    label: "View audit log",
    group: "Governance",
    description: "See every recorded administrator action.",
    risk: "standard",
    grantable: true,
  },
};

export const ROLE_INFO: Record<AdminRole, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Staff account limited to its assigned permissions." },
  executive: {
    label: "Executive",
    description:
      "Staff account limited to its assigned permissions. No extra API privileges today.",
  },
  superAdmin: {
    label: "Super admin",
    description: "Full access, including administrator management and moving company funds.",
  },
};

export interface AdminPrincipal {
  role: AdminRole;
  permissions: readonly string[];
}

export function isSuperAdmin(admin: AdminPrincipal | null | undefined): boolean {
  return admin?.role === "superAdmin";
}

/** Same rule as the API's hasPermission: super admins bypass the permission list. */
export function hasPermission(
  admin: AdminPrincipal | null | undefined,
  permission: AdminPermission,
): boolean {
  if (!admin) return false;
  return isSuperAdmin(admin) || admin.permissions.includes(permission);
}

/** Access requirement for a screen or action. */
export type AccessRule =
  | { superAdmin: true }
  | { permission: AdminPermission }
  /** At least one of the permissions. */
  | { anyPermission: readonly AdminPermission[] }
  | "authenticated";

export function canAccess(admin: AdminPrincipal | null | undefined, rule: AccessRule): boolean {
  if (!admin) return false;
  if (rule === "authenticated") return true;
  if ("superAdmin" in rule) return isSuperAdmin(admin);
  if ("anyPermission" in rule) return rule.anyPermission.some((p) => hasPermission(admin, p));
  return hasPermission(admin, rule.permission);
}

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}
