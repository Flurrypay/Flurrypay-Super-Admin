import {
  CircleCheckIcon,
  CircleSlashIcon,
  ClockIcon,
  SearchCheckIcon,
  ThumbsUpIcon,
} from "lucide-react";

import type { StatusMap } from "@/components/status/status-badge";

import type { SupportStatus, SupportType } from "./api";

/**
 * Statuses the two tables use, in one map.
 *
 * `appeal` and `contact_message` both store `status` as free varchar with
 * different vocabularies — "approved"/"rejected" only ever appear on appeals,
 * "resolved" only on contact messages. Merging them here rather than keeping two
 * maps means a value appearing on the wrong type renders correctly instead of
 * falling through to "Unknown", which is the right trade for a column neither
 * table constrains.
 */
export const SUPPORT_STATUS: StatusMap<SupportStatus> = {
  pending: {
    label: "Pending",
    tone: "warning",
    icon: ClockIcon,
    description: "Nobody has answered this yet.",
  },
  under_review: {
    label: "Under review",
    tone: "info",
    icon: SearchCheckIcon,
    description: "Being looked into, not yet answered.",
  },
  resolved: {
    label: "Resolved",
    tone: "success",
    icon: CircleCheckIcon,
    description: "Answered and closed.",
  },
  approved: {
    label: "Approved",
    tone: "success",
    icon: ThumbsUpIcon,
    description: "The appeal was granted — restrictions on the account should be lifted.",
  },
  rejected: {
    label: "Rejected",
    tone: "danger",
    icon: CircleSlashIcon,
    description: "The appeal was refused. The account stays as it is.",
  },
};

export const SUPPORT_TYPE_LABEL: Record<SupportType, string> = {
  appeal: "Account appeal",
  contact: "Contact message",
};

/**
 * The statuses each type can actually be set to.
 *
 * Offering "approved" on a contact message would record a decision the word does
 * not describe, and offering "resolved" on an appeal hides whether the account
 * was given back — which is the only thing anyone reading an appeal wants to
 * know.
 */
export const SUPPORT_STATUS_OPTIONS: Record<SupportType, SupportStatus[]> = {
  appeal: ["pending", "under_review", "approved", "rejected"],
  contact: ["pending", "under_review", "resolved"],
};

/** A readable name for a thread, falling back through what the row actually has. */
export function supportSubject(message: { subject: string | null; type: SupportType }): string {
  return message.subject?.trim() || SUPPORT_TYPE_LABEL[message.type];
}
