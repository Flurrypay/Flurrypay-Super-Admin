import {
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  LoaderCircleIcon,
  Undo2Icon,
} from "lucide-react";

import type { StatusMap } from "@/components/status/status-badge";
import type { BadgeTone } from "@/components/ui/badge";
import { humanizeEnum } from "@/lib/format";

import type { FlagReason, FlagSeverity, TransactionStatus, TransactionType } from "./api";

export const TRANSACTION_STATUS: StatusMap<TransactionStatus> = {
  PENDING: {
    label: "Pending",
    tone: "neutral",
    icon: ClockIcon,
    description: "Created and awaiting processing.",
  },
  PROCESSING: {
    label: "Processing",
    tone: "info",
    icon: LoaderCircleIcon,
    description: "Submitted to a provider; the outcome is not yet known.",
  },
  COMPLETED: {
    label: "Completed",
    tone: "success",
    icon: CircleCheckIcon,
    description: "Settled successfully.",
  },
  FAILED: {
    label: "Failed",
    tone: "danger",
    icon: CircleXIcon,
    description: "Did not complete. Check whether funds were returned (reversal).",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "neutral",
    icon: BanIcon,
    description: "Stopped before processing.",
  },
  REVERSED: {
    label: "Reversed",
    tone: "warning",
    icon: Undo2Icon,
    description: "Funds were returned to the customer.",
  },
};

export type Direction = "in" | "out" | "exchange";

export const TRANSACTION_TYPE: Record<TransactionType, { label: string; direction: Direction }> = {
  CRYPTO_BUY: { label: "Crypto buy", direction: "exchange" },
  CRYPTO_SELL: { label: "Crypto sell", direction: "exchange" },
  CRYPTO_SWAP: { label: "Crypto swap", direction: "exchange" },
  CRYPTO_SEND: { label: "Crypto send", direction: "out" },
  CRYPTO_RECEIVE: { label: "Crypto receive", direction: "in" },
  FIAT_DEPOSIT: { label: "Naira deposit", direction: "in" },
  FIAT_WITHDRAWAL: { label: "Naira withdrawal", direction: "out" },
  WALLET_FUNDING: { label: "Wallet funding", direction: "in" },
  WALLET_WITHDRAWAL: { label: "Wallet withdrawal", direction: "out" },
  AIRTIME_PURCHASE: { label: "Airtime", direction: "out" },
  DATA_PURCHASE: { label: "Data bundle", direction: "out" },
  ELECTRICITY_BILL: { label: "Electricity", direction: "out" },
  CABLE_SUBSCRIPTION: { label: "Cable TV", direction: "out" },
};

export function transactionTypeLabel(type: string): string {
  return type in TRANSACTION_TYPE ? TRANSACTION_TYPE[type as TransactionType].label : type;
}

export function transactionDirection(type: string): Direction | null {
  return type in TRANSACTION_TYPE ? TRANSACTION_TYPE[type as TransactionType].direction : null;
}

/* ─── Flags ──────────────────────────────────────────────────────────────── */

export const FLAG_REASON_LABEL: Record<FlagReason, string> = {
  SUSPECTED_FRAUD: "Suspected fraud",
  CUSTOMER_DISPUTE: "Customer dispute",
  UNUSUAL_PATTERN: "Unusual pattern",
  AWAITING_PROOF_OF_FUNDS: "Awaiting proof of funds",
  POSSIBLE_DUPLICATE: "Possible duplicate",
  WRONG_AMOUNT: "Wrong amount",
  PROVIDER_DISCREPANCY: "Provider discrepancy",
  SANCTIONS_OR_WATCHLIST: "Sanctions or watchlist",
  OTHER: "Other",
};

/**
 * What each reason is for, shown in the flag dialog.
 *
 * Present because the labels alone are not a shared vocabulary: without this,
 * "unusual pattern" and "suspected fraud" get used interchangeably and the counts
 * they exist to produce stop meaning anything.
 */
export const FLAG_REASON_HINT: Record<FlagReason, string> = {
  SUSPECTED_FRAUD: "You believe this money is not the customer's to move.",
  CUSTOMER_DISPUTE: "The customer says this transaction is wrong or unauthorised.",
  UNUSUAL_PATTERN: "Out of character for this account, with no specific allegation.",
  AWAITING_PROOF_OF_FUNDS: "Waiting on documents explaining where the money came from.",
  POSSIBLE_DUPLICATE: "May be the same payment recorded or sent twice.",
  WRONG_AMOUNT: "The amount recorded does not match what moved.",
  PROVIDER_DISCREPANCY: "Our record and the provider's record disagree.",
  SANCTIONS_OR_WATCHLIST: "A party to this matches a watchlist entry.",
  OTHER: "Anything the list above does not cover. Say what it is in the note.",
};

export const FLAG_SEVERITY_LABEL: Record<FlagSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const FLAG_SEVERITY_TONE: Record<FlagSeverity, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

/**
 * What the severity is used for, so it is chosen rather than guessed.
 *
 * It orders the review queue and nothing else. Worth stating plainly in the
 * dialog, because an admin who assumes HIGH restricts the account will either
 * avoid it or expect something that does not happen — flagging a transaction
 * never restricts anyone. Automatic post-no-debit comes from a HIGH or CRITICAL
 * compliance CASE, which is a different and heavier act.
 */
export const FLAG_SEVERITY_HINT =
  "Sets where this sits in the review queue. It does not restrict the customer or change the transaction.";

/**
 * Read a flag reason or severity the API sent us.
 *
 * Typed as plain string lookups rather than cast to the union: these values
 * arrive from the API, and casting a response field into a key type asserts a
 * guarantee the response does not carry. A reason this build has not heard of
 * gets humanised instead of rendering as blank.
 */
export function flagReasonLabel(value: string | null | undefined): string {
  if (!value) return "Flagged";
  return (FLAG_REASON_LABEL as Record<string, string>)[value] ?? humanizeEnum(value);
}

export function flagSeverityLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return (FLAG_SEVERITY_LABEL as Record<string, string>)[value] ?? humanizeEnum(value);
}

export function flagSeverityTone(value: string | null | undefined): BadgeTone {
  if (!value) return "warning";
  return (FLAG_SEVERITY_TONE as Record<string, BadgeTone>)[value] ?? "warning";
}
