import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const stranded = adminPaths.stranded;

/* ─── Stranded transfers ─────────────────────────────────────────────────── */

export const strandedTransferSchema = z.object({
  reference: z.string(),
  transactionType: z.string().catch(""),
  status: z.string().catch(""),
  userId: z.string(),
  email: nullableString,
  fullName: z.string().catch(""),
  phoneNumber: nullableString,
  amountNaira: decimal,
  feeAlreadyRefundedNaira: decimal,
  /** Principal only; a fee already returned is not owed again. */
  owedNaira: decimal,
  ageHours: z.number().catch(0),
  createdAt: timestamp,
  externalId: nullableString,
  stage: nullableString,
  alreadyRefunded: z.boolean().catch(false),
  bankName: nullableString,
  accountNumber: nullableString,
});
export type StrandedTransfer = z.output<typeof strandedTransferSchema>;

const strandedSummarySchema = z.object({
  count: z.number().catch(0),
  totalNaira: decimal,
  oldestHours: z.number().catch(0),
});
export type StrandedSummary = z.output<typeof strandedSummarySchema>;

/** Transfers debited from the customer but neither delivered nor returned, oldest first. */
export function fetchStrandedTransfers(includeResolved: boolean, signal?: AbortSignal) {
  return adminApi.get(stranded, {
    query: { includeResolved: includeResolved ? "true" : undefined },
    schema: z
      .object({
        data: z.object({ items: z.array(strandedTransferSchema), summary: strandedSummarySchema }),
      })
      .transform((v) => v.data),
    signal,
    timeoutMs: 45_000,
  });
}

export function fetchStrandedSummary(signal?: AbortSignal) {
  return adminApi.get(`${stranded}/summary`, {
    schema: z.object({ data: strandedSummarySchema }).transform((v) => v.data),
    signal,
  });
}

const messageSchema = z.object({ message: z.string().catch("") });

/** The provider did deliver it: corrects the status, moves no money (company withdrawal permission + 2FA). */
export function markStrandedDelivered(
  reference: string,
  input: { note: string; twoFACode: string },
) {
  return adminApi.post(`${stranded}/${encodeURIComponent(reference)}/delivered`, input, {
    schema: messageSchema,
  });
}

/** The provider never sent it: returns the principal to the customer (company withdrawal permission + 2FA). */
export function refundStranded(reference: string, input: { note: string; twoFACode: string }) {
  return adminApi.post(`${stranded}/${encodeURIComponent(reference)}/refund`, input, {
    schema: messageSchema,
  });
}

/* ─── Failed-transaction reversals (super admin) ─────────────────────────── */

export const reversalCandidateSchema = z.object({
  reference: z.string(),
  userid: z.string(),
  type: z.string().catch(""),
  amount: decimal,
  currency: nullableString,
  createdat: timestamp,
  email: nullableString,
  firstname: nullableString,
  /** Predates refund tracking: someone must confirm the customer was never refunded. */
  reversalStatusUnknown: z.boolean().catch(false),
  note: nullableString,
});
export type ReversalCandidate = z.output<typeof reversalCandidateSchema>;

export function fetchReversalCandidates(sinceDays: number, signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.core}/reversal-candidates`, {
    query: { sinceDays },
    schema: z.object({ data: z.array(reversalCandidateSchema) }).transform((v) => v.data),
    signal,
    timeoutMs: 45_000,
  });
}

export interface ReverseInput {
  reference: string;
  /** Shown to the customer. */
  reason: string;
  confirmedNotAlreadyRefunded: boolean;
  password: string;
  twoFACode: string;
}

/** Returns the money to the customer. The API answers 409 when it declines (e.g. already refunded). */
export function reverseTransaction(input: ReverseInput) {
  return adminApi.post(`${adminPaths.core}/reverse-transaction`, input, { schema: messageSchema });
}
