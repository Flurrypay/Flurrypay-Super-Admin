import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  FileCheckIcon,
  FileClockIcon,
  FileXIcon,
  OctagonAlertIcon,
  SearchIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";

import type { StatusMap } from "@/components/status/status-badge";
import type { BadgeTone } from "@/components/ui/badge";

import type { ALERT_STATUSES, MONITORING_RULES, REPORT_STATUSES } from "./api";

export const ALERT_STATUS: StatusMap<(typeof ALERT_STATUSES)[number]> = {
  OPEN: { label: "Open", tone: "warning", icon: CircleDotIcon, description: "Not yet reviewed." },
  UNDER_REVIEW: {
    label: "Under review",
    tone: "info",
    icon: SearchIcon,
    description: "An administrator is looking into it.",
  },
  CLEARED: {
    label: "Cleared",
    tone: "success",
    icon: CircleCheckIcon,
    description: "Reviewed; the activity is explained.",
  },
  ESCALATED: {
    label: "Escalated",
    tone: "danger",
    icon: CircleAlertIcon,
    description: "Passed to the MLRO for a reporting decision.",
  },
  REPORTED: {
    label: "Reported",
    tone: "accent",
    icon: SendIcon,
    description: "Bound to a suspicious activity report.",
  },
};

export const SEVERITY_TONE: Record<string, BadgeTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "neutral",
};

export const SEVERITY_ICON = {
  CRITICAL: OctagonAlertIcon,
  HIGH: TriangleAlertIcon,
  MEDIUM: CircleAlertIcon,
  LOW: CircleIcon,
} as const;

export const RULE_LABEL: Record<(typeof MONITORING_RULES)[number], string> = {
  VALUE_ABOVE_PROFILE: "Value above profile",
  STRUCTURING: "Structuring",
  PASS_THROUGH: "Pass-through funds",
  MULTIPLE_FUNDING_SOURCES: "Many funding sources",
  SHARED_DEVICE: "Shared device",
  DORMANT_REACTIVATION: "Dormant account reactivated",
  HIGH_RISK_CRYPTO_DESTINATION: "High-risk crypto destination",
  INCONSISTENT_WITH_PROFILE: "Inconsistent with profile",
  VERIFICATION_PROBING: "Verification probing",
  HIGH_RISK_JURISDICTION: "High-risk jurisdiction",
  SANCTIONS_HIT: "Sanctions match",
};

export function ruleLabel(rule: string): string {
  return (RULE_LABEL as Record<string, string>)[rule] ?? rule;
}

export const REPORT_STATUS: StatusMap<(typeof REPORT_STATUSES)[number]> = {
  INTERNAL_ESCALATION: {
    label: "Awaiting MLRO",
    tone: "warning",
    icon: FileClockIcon,
    description: "Raised by staff; the MLRO has not assessed it yet.",
  },
  UNDER_ASSESSMENT: {
    label: "Under assessment",
    tone: "info",
    icon: SearchIcon,
    description: "The MLRO is assessing whether to report.",
  },
  NOT_REPORTED: {
    label: "Not reported",
    tone: "neutral",
    icon: FileXIcon,
    description: "Assessed; suspicion not sustained. Kept in the register with the rationale.",
  },
  PENDING_FILING: {
    label: "To be filed",
    tone: "danger",
    icon: FileClockIcon,
    description: "The MLRO decided to report; it must be filed with the NFIU.",
  },
  FILED: {
    label: "Filed",
    tone: "success",
    icon: FileCheckIcon,
    description: "Filed with the NFIU; the acknowledgement reference is recorded.",
  },
};

export function subjectName(
  user: { firstName: string; lastName: string; email: string } | null | undefined,
): string {
  if (!user) return "Unknown customer";
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}
