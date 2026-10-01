import type { BadgeTone } from "@/components/ui/badge";
import { humanizeEnum } from "@/lib/format";

export type AuditCategory =
  "Access" | "Users" | "KYC" | "Money" | "Compliance" | "Administration" | "Platform";

interface ActionInfo {
  label: string;
  category: AuditCategory;
  tone: BadgeTone;
}

/**
 * `AdminAuditAction` values (api/src/app/models/adminAuditLog.ts) plus the
 * free-form actions the API also writes (e.g. freeze). Unknown values still
 * render, humanised.
 */
export const AUDIT_ACTIONS: Record<string, ActionInfo> = {
  ADMIN_LOGIN: { label: "Signed in", category: "Access", tone: "neutral" },
  ADMIN_SESSION_REVOKED_DEVICE_MISMATCH: {
    label: "Session ended: unrecognised device",
    category: "Access",
    tone: "warning",
  },
  USER_ACCOUNT_BLOCKED: { label: "Blocked user", category: "Users", tone: "danger" },
  USER_ACCOUNT_UNBLOCKED: { label: "Unblocked user", category: "Users", tone: "neutral" },
  USER_ACCOUNT_SUSPENDED: { label: "Suspended user", category: "Users", tone: "warning" },
  USER_ACCOUNT_UNSUSPENDED: { label: "Unsuspended user", category: "Users", tone: "neutral" },
  USER_ACCOUNT_FROZEN: { label: "Froze user", category: "Users", tone: "warning" },
  USER_ACCOUNT_UNFROZEN: { label: "Unfroze user", category: "Users", tone: "neutral" },
  USER_ACCOUNT_MANUALLY_VERIFIED: {
    label: "Manually verified user",
    category: "Users",
    tone: "info",
  },
  KYC_APPROVED: { label: "Approved KYC level", category: "KYC", tone: "success" },
  KYC_REJECTED: { label: "Rejected KYC level", category: "KYC", tone: "warning" },
  KYC_DOWNGRADED: { label: "Downgraded KYC level", category: "KYC", tone: "warning" },
  MAKE_WITHDRAWAL: { label: "Company withdrawal", category: "Money", tone: "danger" },
  USER_WALLET_MANUALLY_CREDITED: {
    label: "Manually credited wallet",
    category: "Money",
    tone: "danger",
  },
  USER_WALLET_MANUALLY_DEBITED: {
    label: "Manually debited wallet",
    category: "Money",
    tone: "danger",
  },
  STRANDED_TRANSFER_RESOLVED: {
    label: "Resolved stranded transfer",
    category: "Money",
    tone: "warning",
  },
  PAYOUT_PROVIDER_SWITCHED: {
    label: "Switched payout provider",
    category: "Money",
    tone: "danger",
  },
  PAYOUT_PROVIDER_CONFIGURED: {
    label: "Configured payout provider",
    category: "Money",
    tone: "danger",
  },
  RATE_UPDATED: { label: "Updated rates", category: "Platform", tone: "warning" },
  BROADCAST_SENT: { label: "Sent broadcast", category: "Platform", tone: "info" },
  TRANSACTION_CIRCUIT_BREAKER_TRIGGERED: {
    label: "Circuit breaker triggered",
    category: "Platform",
    tone: "danger",
  },
  TRANSACTION_VELOCITY_LIMIT_TRIGGERED: {
    label: "Velocity limit triggered",
    category: "Platform",
    tone: "warning",
  },
  COMPLIANCE_ALERT_DISPOSITIONED: {
    label: "Dispositioned compliance alert",
    category: "Compliance",
    tone: "info",
  },
  COMPLIANCE_RISK_RATING_CHANGED: {
    label: "Changed risk rating",
    category: "Compliance",
    tone: "warning",
  },
  COMPLIANCE_PEP_STATUS_CHANGED: {
    label: "Changed PEP status",
    category: "Compliance",
    tone: "warning",
  },
  COMPLIANCE_CUSTOMER_SCREENED: {
    label: "Screened customer",
    category: "Compliance",
    tone: "neutral",
  },
  COMPLIANCE_STR_RAISED: { label: "Raised STR", category: "Compliance", tone: "danger" },
  COMPLIANCE_STR_ASSESSED: { label: "Assessed STR", category: "Compliance", tone: "warning" },
  COMPLIANCE_STR_FILED: { label: "Filed STR", category: "Compliance", tone: "danger" },
  ADMIN_ACCOUNT_CREATED: {
    label: "Invited administrator",
    category: "Administration",
    tone: "info",
  },
  ADMIN_PERMISSIONS_UPDATED: {
    label: "Changed admin permissions",
    category: "Administration",
    tone: "warning",
  },
  ADMIN_ACCOUNT_SUSPENDED: {
    label: "Suspended administrator",
    category: "Administration",
    tone: "danger",
  },
  ADMIN_ACCOUNT_UNSUSPENDED: {
    label: "Reinstated administrator",
    category: "Administration",
    tone: "neutral",
  },
  ADMIN_ACCOUNT_REMOVED: {
    label: "Removed administrator",
    category: "Administration",
    tone: "danger",
  },
  ADMIN_SESSIONS_REVOKED: {
    label: "Signed out administrator",
    category: "Administration",
    tone: "warning",
  },
  ADMIN_INVITATION_RESENT: {
    label: "Resent invitation",
    category: "Administration",
    tone: "info",
  },
  ADMIN_INVITATION_REVOKED: {
    label: "Revoked invitation",
    category: "Administration",
    tone: "warning",
  },
  ADMIN_ROLE_CREATED: { label: "Created role", category: "Administration", tone: "info" },
  ADMIN_ROLE_UPDATED: { label: "Updated role", category: "Administration", tone: "warning" },
  ADMIN_ROLE_DELETED: { label: "Deleted role", category: "Administration", tone: "warning" },
  ADMIN_RECOVERY_CODES_GENERATED: {
    label: "Generated recovery codes",
    category: "Access",
    tone: "info",
  },
  ADMIN_RECOVERY_CODE_USED: {
    label: "Signed in with recovery code",
    category: "Access",
    tone: "warning",
  },
  DATA_EXPORTED: { label: "Exported data", category: "Platform", tone: "info" },
  USER_STATEMENT_DOWNLOADED: {
    label: "Downloaded statement",
    category: "Users",
    tone: "info",
  },
  KYC_PROFILE_VIEWED: { label: "Viewed KYC profile", category: "KYC", tone: "neutral" },
  TRANSACTION_REVERSED: { label: "Reversed transaction", category: "Money", tone: "danger" },
  USER_ACCOUNT_DELETED: { label: "Deleted user", category: "Users", tone: "danger" },
  USER_ACCOUNTS_BULK_DELETED: { label: "Bulk-deleted users", category: "Users", tone: "danger" },
  OUTBOUND_LOCKED: { label: "Locked outbound funds", category: "Users", tone: "warning" },
  SWITCH_PAYOUT_PROVIDER: { label: "Switched payout provider", category: "Money", tone: "danger" },
  CONFIGURE_PAYOUT_PROVIDER: {
    label: "Configured payout provider",
    category: "Money",
    tone: "danger",
  },
};

export function auditActionInfo(action: string): ActionInfo {
  return (
    AUDIT_ACTIONS[action] ?? { label: humanizeEnum(action), category: "Platform", tone: "neutral" }
  );
}

/** Metadata keys whose values are never displayed, even if the API recorded them. */
const SECRET_KEY = /pass(word)?|pin|otp|code|token|secret|cvv|cvc|bvn|nin|authorization|cookie/i;

export function isSecretMetadataKey(key: string): boolean {
  return SECRET_KEY.test(key);
}
