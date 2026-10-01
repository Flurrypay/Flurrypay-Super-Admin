import {
  ArrowUpRightIcon,
  BanknoteIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  ClipboardCheckIcon,
  CpuIcon,
  FileTextIcon,
  GavelIcon,
  type LucideIcon,
  MessageSquareIcon,
  OctagonAlertIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  UnlockIcon,
  UserCheckIcon,
} from "lucide-react";

import type { BadgeTone } from "@/components/ui/badge";

/**
 * Shared vocabulary for the risk surface.
 *
 * Kept in one place because the same concepts appear on the case list, the
 * investigation workspace, the network view and the watchlist, and three
 * slightly different words for "escalated" is how a team stops trusting what
 * the screen says.
 *
 * LANGUAGE RULE, applied throughout: these describe patterns and states, never
 * people. Nothing here renders "fraudster", "launderer" or "criminal" — the
 * system detects, investigators determine.
 */

export const CASE_EVENT_LABEL: Record<
  string,
  { label: string; icon: LucideIcon; tone: BadgeTone }
> = {
  NOTE: { label: "Note", icon: MessageSquareIcon, tone: "neutral" },
  STATUS_CHANGE: { label: "Status change", icon: CircleDotIcon, tone: "info" },
  ASSIGNMENT: { label: "Assignment", icon: UserCheckIcon, tone: "info" },
  ESCALATION: { label: "Escalation", icon: ArrowUpRightIcon, tone: "warning" },
  EVIDENCE_REQUESTED: { label: "Evidence requested", icon: FileTextIcon, tone: "info" },
  EVIDENCE_SUBMITTED: { label: "Evidence supplied", icon: FileTextIcon, tone: "success" },
  ACTION_TAKEN: { label: "Action taken", icon: ShieldAlertIcon, tone: "warning" },
  HOLD_PLACED: { label: "Funds held", icon: BanknoteIcon, tone: "warning" },
  HOLD_RELEASED: { label: "Funds released", icon: UnlockIcon, tone: "success" },
  CHECKLIST_UPDATED: { label: "Checklist", icon: ClipboardCheckIcon, tone: "neutral" },
  DECISION: { label: "Decision", icon: GavelIcon, tone: "accent" },
  SYSTEM: { label: "System", icon: CpuIcon, tone: "neutral" },
};

export function caseEventMeta(type: string) {
  return CASE_EVENT_LABEL[type] ?? { label: type, icon: CircleIcon, tone: "neutral" as BadgeTone };
}

export const LINK_TYPE_LABEL: Record<string, string> = {
  SHARED_DEVICE: "Shared device",
  SHARED_BENEFICIARY: "Shared payee account",
  SHARED_CRYPTO_DESTINATION: "Shared crypto destination",
  SHARED_IP: "Shared IP address",
  SHARED_PHONE: "Shared phone number",
  SHARED_EMAIL_ROOT: "Same mailbox",
};

/**
 * Link strength never renders as danger.
 *
 * A strong link means "these accounts are definitely connected", not "these
 * accounts are definitely a problem" — and a red badge would be read as the
 * second.
 */
export const LINK_STRENGTH_TONE: Record<string, BadgeTone> = {
  STRONG: "warning",
  MODERATE: "info",
  WEAK: "neutral",
};

export const WATCHLIST_ENTITY_LABEL: Record<string, string> = {
  USER: "Customer",
  BANK_ACCOUNT: "Bank account",
  WALLET_ADDRESS: "Wallet address",
  DEVICE: "Device",
  IP_ADDRESS: "IP address",
  PHONE: "Phone number",
  EMAIL: "Email address",
  COUNTERPARTY_NAME: "Counterparty name",
};

export const WATCHLIST_CATEGORY_LABEL: Record<string, string> = {
  CONFIRMED_FRAUD: "Confirmed fraud",
  SUSPECTED_MULE: "Potential mule activity",
  AML_CONCERN: "AML concern",
  CHARGEBACK_ABUSE: "Chargeback abuse",
  LAW_ENFORCEMENT_REQUEST: "Law enforcement request",
  SCREENING_MATCH: "External screening match",
  INTERNAL_REVIEW: "Internal review",
  OTHER: "Other",
};

export const WATCHLIST_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "warning",
  UNDER_REVIEW: "info",
  EXPIRED: "neutral",
  REMOVED: "neutral",
};

export const ATO_BAND_TONE: Record<string, BadgeTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  ELEVATED: "warning",
  LOW: "info",
  NONE: "success",
};

export const ATO_BAND_ICON: Record<string, LucideIcon> = {
  CRITICAL: OctagonAlertIcon,
  HIGH: TriangleAlertIcon,
  ELEVATED: CircleAlertIcon,
  LOW: CircleDotIcon,
  NONE: CircleCheckIcon,
};

export const CHECKLIST_STATE_LABEL: Record<string, string> = {
  PENDING: "Pending",
  DONE: "Done",
  NOT_APPLICABLE: "Not applicable",
};

/** Engine signal keys → what the rule actually looks for. */
export const ENGINE_RULE_DESCRIPTION: Record<string, string> = {
  AMOUNT_VS_BASELINE: "Amount far above this customer's own 95th-percentile transaction.",
  FIRST_TIME_CREDIT_SIZE: "Credit far larger than anything this account has received before.",
  RAPID_PASS_THROUGH: "Most of an incoming credit left again within 15 minutes.",
  NEW_BENEFICIARY: "First payment to this destination.",
  NO_DEVICE_IDENTITY: "The request carried no device identifier.",
  UNTRUSTED_DEVICE: "Device not claimed, or ownership not fully proven.",
  UNUSUAL_HOUR: "Outside the hours this customer normally transacts.",
  VELOCITY: "More transactions in 24 hours than this customer's busiest previous day.",
  MULTIPLE_FUNDING_SOURCES: "Many separate credits converging on the account in 24 hours.",
  STRUCTURING: "Repeated transactions sitting just under a configured threshold.",
  VERIFICATION_PROBING: "Repeated failed verification attempts before this transaction.",
  HIGH_RISK_JURISDICTION: "Request IP resolves to a listed jurisdiction. Corroboration only.",
  WATCHLIST_MATCH: "An identifier on this event is on the internal watchlist.",
  THIRD_PARTY_FUNDING: "Credit from a sender sharing no name part with the account holder.",
};

export function engineRuleDescription(rule: string): string | undefined {
  return ENGINE_RULE_DESCRIPTION[rule];
}
