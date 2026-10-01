import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const base = adminPaths.risk;
const count = z.coerce.number().catch(0);
const messageSchema = z.object({ message: z.string().catch("") });

export const CASE_STATUSES = [
  "OPEN",
  "AWAITING_CUSTOMER",
  "UNDER_REVIEW",
  "CLEARED",
  "CONFIRMED",
  "CLOSED",
] as const;
export const CASE_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const CASE_OUTCOMES = ["CLEARED", "CONFIRMED", "CLOSED"] as const;
export type CaseOutcome = (typeof CASE_OUTCOMES)[number];
/** Examples the API suggests; any short label is accepted. */
export const EVIDENCE_TYPES = [
  "source_of_funds",
  "relationship_with_sender",
  "invoice",
  "purpose_of_transaction",
] as const;

const overviewSchema = z.object({
  cases: z.object({ open: count, awaitingCustomer: count, overdue: count }),
  holds: z.object({ active: count, totalHeldNaira: decimal }),
  interventionsLast7Days: count,
});
export type RiskOverview = z.output<typeof overviewSchema>;

export function fetchRiskOverview(signal?: AbortSignal) {
  return adminApi.get(`${base}/overview`, {
    schema: z.object({ data: overviewSchema }).transform((v) => v.data),
    signal,
  });
}

export const riskCaseSchema = z.object({
  id: z.string(),
  reference: z.string(),
  userId: z.string(),
  status: z.string(),
  severity: z.string(),
  trigger: z.string().catch(""),
  description: nullableString,
  riskScore: z.number().nullish(),
  heldAmountNaira: decimal,
  heldTransactionReference: nullableString,
  dueAt: timestamp,
  evidenceRequested: z.array(z.string()).nullish().catch(null),
  evidenceRequestedAt: timestamp,
  evidenceSubmitted: z
    .array(
      z.object({
        type: z.string().catch(""),
        note: nullableString,
        submittedAt: timestamp,
      }),
    )
    .nullish()
    .catch(null),
  resolution: nullableString,
  resolvedAt: timestamp,
  createdAt: timestamp,
  // Ownership. Nullable throughout: a case opened before these existed, or
  // one nobody has taken, is a normal state rather than a missing field.
  queue: nullableString,
  assignedToAdminId: nullableString,
  assignedAt: timestamp,
  escalatedAt: timestamp,
  escalationReason: nullableString,
});
export type RiskCase = z.output<typeof riskCaseSchema>;

export interface RiskCaseFilter {
  status?: string | null;
  severity?: string | null;
  /** "me", "unassigned", or an administrator id. */
  assignedToAdminId?: string | null;
  queue?: string | null;
  overdue?: boolean;
  escalated?: boolean;
}

/**
 * Most severe first, then oldest; the API returns at most 100.
 *
 * Queue filters are sent to the server rather than applied to the returned
 * page. With a hard cap of 100 rows ordered by severity, filtering in the
 * browser would silently hide the overdue case ranked 140th — which is
 * precisely the one somebody is looking for.
 */
export function fetchRiskCases(filter: RiskCaseFilter, signal?: AbortSignal) {
  return adminApi.get(`${base}/cases`, {
    query: {
      status: filter.status ?? undefined,
      severity: filter.severity ?? undefined,
      assignedToAdminId: filter.assignedToAdminId ?? undefined,
      queue: filter.queue ?? undefined,
      overdue: filter.overdue ? "true" : undefined,
      escalated: filter.escalated ? "true" : undefined,
    },
    schema: z.object({ data: z.array(riskCaseSchema) }).transform((v) => v.data),
    signal,
  });
}

/** Moves the case to AWAITING_CUSTOMER and notifies the customer in the app. */
export function requestCaseEvidence(id: string, evidenceRequested: string[]) {
  return adminApi.post(`${base}/cases/${encodeURIComponent(id)}/request-evidence`, {
    evidenceRequested,
  });
}

/** CLEARED releases the case's holds and lifts restrictions it placed. */
export function resolveRiskCase(id: string, input: { outcome: CaseOutcome; resolution: string }) {
  return adminApi.post(`${base}/cases/${encodeURIComponent(id)}/resolve`, input, {
    schema: messageSchema,
  });
}

export const fundHoldSchema = z.object({
  id: z.string(),
  userId: z.string(),
  assetType: z.string().catch("NAIRA"),
  currency: nullableString,
  amountCrypto: decimal,
  amountNaira: decimal,
  status: z.string(),
  reason: z.string().catch(""),
  caseId: nullableString,
  transactionReference: nullableString,
  createdAt: timestamp,
});
export type FundHold = z.output<typeof fundHoldSchema>;

/** Active holds, oldest first. */
export function fetchActiveHolds(signal?: AbortSignal) {
  return adminApi.get(`${base}/holds`, {
    schema: z.object({ data: z.array(fundHoldSchema) }).transform((v) => v.data),
    signal,
  });
}

export interface PlaceHoldInput {
  userId: string;
  amountNaira: string;
  /** Shown to the customer; at least 10 characters. */
  reason: string;
  caseId?: string;
  transactionReference?: string;
  password: string;
  twoFACode: string;
}

/** Holds part of a customer's naira balance (password + 2FA). */
export function placeHold(input: PlaceHoldInput) {
  return adminApi.post(`${base}/holds`, input, { schema: messageSchema });
}

export function releaseHold(id: string, reason: string) {
  return adminApi.post(
    `${base}/holds/${encodeURIComponent(id)}/release`,
    { reason },
    {
      schema: messageSchema,
    },
  );
}
