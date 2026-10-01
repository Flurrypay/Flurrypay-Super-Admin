import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

/** `transactions.transactionType` (api/src/app/models/transactions.model.ts). */
export const TRANSACTION_TYPES = [
  "CRYPTO_BUY",
  "CRYPTO_SELL",
  "CRYPTO_SWAP",
  "CRYPTO_SEND",
  "CRYPTO_RECEIVE",
  "FIAT_DEPOSIT",
  "FIAT_WITHDRAWAL",
  "WALLET_FUNDING",
  "WALLET_WITHDRAWAL",
  "AIRTIME_PURCHASE",
  "DATA_PURCHASE",
  "ELECTRICITY_BILL",
  "CABLE_SUBSCRIPTION",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const CURRENCY_TYPES = ["FIAT", "CRYPTO"] as const;

/**
 * Columns the table may sort by.
 *
 * The API now checks `sortBy` against its own allowlist before interpolating it
 * into ORDER BY (api/src/app/services/transaction.service.ts), so an unknown key
 * falls back to createdAt instead of reaching the database. This list is kept in
 * step with that one so the UI never sends a key that silently does nothing.
 */
export const TRANSACTION_SORT_KEYS = [
  "createdAt",
  "amount",
  "status",
  "transactionType",
  "flaggedAt",
] as const;

/**
 * Why a transaction was flagged (api/src/app/models/transactions.model.ts
 * TransactionFlagReason). A fixed set so the question "how many
 * suspected-fraud flags did we raise last month" has an answer.
 */
export const FLAG_REASONS = [
  "SUSPECTED_FRAUD",
  "CUSTOMER_DISPUTE",
  "UNUSUAL_PATTERN",
  "AWAITING_PROOF_OF_FUNDS",
  "POSSIBLE_DUPLICATE",
  "WRONG_AMOUNT",
  "PROVIDER_DISCREPANCY",
  "SANCTIONS_OR_WATCHLIST",
  "OTHER",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const FLAG_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

/** The two views of the flag column the list endpoint offers. */
export const FLAG_VIEWS = ["FLAGGED", "CLEARED"] as const;

/**
 * One naira-wallet movement behind a transaction.
 *
 * From `wallet_ledger`, matched on the transaction's reference by the API.
 * `balanceBefore`/`balanceAfter` were captured inside the same locked database
 * transaction as the balance change, so they are what the balance actually did
 * — not a figure derived afterwards from an amount.
 */
const walletLedgerEntrySchema = z.object({
  id: z.string(),
  direction: z.enum(["CREDIT", "DEBIT"]).catch("CREDIT"),
  amountNaira: decimal,
  balanceBefore: decimal,
  balanceAfter: decimal,
  source: z.string().catch(""),
  narration: nullableString,
  createdAt: timestamp,
});
export type WalletLedgerEntry = z.output<typeof walletLedgerEntrySchema>;

/**
 * What one transaction did to the customer's naira balance, end to end.
 *
 * Null on a transaction that never touched the naira wallet — a crypto send
 * between two wallets, or a movement recorded before the ledger existed. Null
 * is rendered as "no naira movement", never as zero: a zero would be a claim
 * about the balance, and we do not have one to make.
 */
const walletMovementSchema = z.object({
  balanceBefore: decimal,
  balanceAfter: decimal,
  /** after − before. Signed, so a net debit is negative. */
  netChange: decimal,
  /** Oldest first. A withdrawal is the principal and the fee, separately. */
  entries: z.array(walletLedgerEntrySchema).catch([]),
  /**
   * The entries do not form an unbroken chain: something changed the balance
   * in between that this reference does not account for. Surfaced rather than
   * smoothed over — it can mean a movement bypassed the ledger entirely.
   */
  hasGap: z.boolean().catch(false),
});
export type WalletMovement = z.output<typeof walletMovementSchema>;

export const transactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  transactionType: z.string(),
  status: z.string(),
  title: nullableString,
  description: nullableString,
  amount: decimal,
  currency: nullableString,
  currencyType: nullableString,
  fromCurrency: nullableString,
  fromAmount: decimal,
  toCurrency: nullableString,
  toAmount: decimal,
  exchangeRate: decimal,
  fee: decimal,
  feeCurrency: nullableString,
  reference: nullableString,
  externalId: nullableString,
  provider: nullableString,
  walletAddress: nullableString,
  recipientAddress: nullableString,
  senderAddress: nullableString,
  transactionHash: nullableString,
  network: nullableString,
  phoneNumber: nullableString,
  meterNumber: nullableString,
  customerName: nullableString,
  failureReason: nullableString,
  failureCode: nullableString,
  failureOurFault: z.boolean().nullish(),
  reversedAt: timestamp,
  reversedAmount: decimal,
  reversalReason: nullableString,
  reversedByAdminId: nullableString,
  // ── Admin flag ─────────────────────────────────────────────────────
  // Internal only: none of this is shown to the customer, and the API does not
  // expose it on any customer-facing endpoint.
  flaggedAt: timestamp,
  flagReason: nullableString,
  flagSeverity: nullableString,
  flagNote: nullableString,
  flaggedByAdminId: nullableString,
  flagClearedAt: timestamp,
  flagClearedByAdminId: nullableString,
  flagResolution: nullableString,
  /**
   * The naira balance either side of this transaction. See walletMovementSchema.
   *
   * Normalised to null rather than left as `undefined` when the key is absent,
   * so "no movement" is one value instead of two. Every consumer would
   * otherwise have to handle both, and one of them eventually would not.
   */
  walletMovement: walletMovementSchema
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  createdAt: timestamp,
  updatedAt: timestamp,
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().catch(""),
      lastName: z.string().catch(""),
    })
    .nullish()
    .catch(null),
});
export type Transaction = z.output<typeof transactionSchema>;

/**
 * Is there an open flag on this transaction?
 *
 * Raised and not yet cleared. A cleared flag stays on the row as history, so
 * "has a flaggedAt" is not the same question — and treating it as one is how a
 * finished review keeps reappearing in the queue.
 */
export function isFlagged(tx: Transaction): boolean {
  return tx.flaggedAt !== null && tx.flagClearedAt === null;
}

const pageSchema = z
  .object({
    data: z.object({
      transactions: z.array(transactionSchema),
      pagination: z.object({ total: z.number(), page: z.number(), limit: z.number() }),
    }),
  })
  .transform(({ data }) => ({ rows: data.transactions, total: data.pagination.total }));

export interface TransactionQuery {
  page: number;
  pageSize: number;
  search?: string;
  type?: TransactionType | null;
  status?: TransactionStatus | null;
  currencyType?: (typeof CURRENCY_TYPES)[number] | null;
  userId?: string | null;
  /** Inclusive ISO bounds. */
  from?: string | null;
  to?: string | null;
  /** "FLAGGED" = open flags only; "CLEARED" = flags already dealt with. */
  flagged?: (typeof FLAG_VIEWS)[number] | null;
  flagSeverity?: FlagSeverity | null;
  sortBy?: (typeof TRANSACTION_SORT_KEYS)[number];
  sortOrder?: "asc" | "desc";
}

/** Server-paginated ledger (`GET /transactions/admin/all`, limit ≤ 200). */
export function fetchTransactions(query: TransactionQuery, signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.transactions}/all`, {
    query: {
      page: query.page,
      limit: query.pageSize,
      search: query.search?.trim() || undefined,
      type: query.type,
      status: query.status,
      currencyType: query.currencyType,
      userId: query.userId,
      startDate: query.from,
      endDate: query.to,
      flagged: query.flagged,
      flagSeverity: query.flagSeverity,
      sortBy: query.sortBy ?? "createdAt",
      sortOrder: (query.sortOrder ?? "desc").toUpperCase(),
    },
    schema: pageSchema,
    signal,
  });
}

/** Exact count for a filter, using the paginated endpoint's `total` (one row fetched). */
export async function countTransactions(
  filter: Omit<TransactionQuery, "page" | "pageSize">,
  signal?: AbortSignal,
): Promise<number> {
  const { total } = await fetchTransactions({ ...filter, page: 1, pageSize: 1 }, signal);
  return total;
}

/**
 * There is no single-transaction endpoint; references are unique, so a
 * reference search returns at most one exact match.
 */
export async function fetchTransactionByReference(reference: string, signal?: AbortSignal) {
  const { rows } = await fetchTransactions({ page: 1, pageSize: 25, search: reference }, signal);
  return rows.find((row) => row.reference === reference || row.id === reference) ?? null;
}

/* ─── Flagging a transaction for review ──────────────────────────────────── */

/**
 * Raise a flag.
 *
 * Needs `compliance.review` server-side, and no step-up credentials: a flag
 * moves no money, restricts nothing and is invisible to the customer. Asking for
 * a password and an authenticator code to write an annotation would mean nobody
 * ever writes one.
 *
 * The API refuses a note under 10 characters, and answers 409 ALREADY_FLAGGED
 * when somebody else got there first — which the dialog surfaces rather than
 * swallowing, because "who already flagged this and why" is what the admin wants
 * at that point.
 */
export function flagTransaction(
  id: string,
  input: { reason: FlagReason; severity: FlagSeverity; note: string },
) {
  return adminApi.post(`${adminPaths.transactions}/${encodeURIComponent(id)}/flag`, input);
}

/** Close an open flag. The resolution is the record that it was actually checked. */
export function clearTransactionFlag(id: string, resolution: string) {
  return adminApi.post(`${adminPaths.transactions}/${encodeURIComponent(id)}/flag/clear`, {
    resolution,
  });
}

/**
 * Open flags by severity, across the whole ledger.
 *
 * Separate from the list endpoint's `totals`, which only ever counted the page it
 * returned — so a "flagged" number taken from there was the number of flagged
 * rows on screen, not in the system.
 */
export function fetchFlagSummary(signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.transactions}/flags/summary`, {
    schema: z
      .object({
        data: z.record(z.string(), z.number()).catch({}),
      })
      .transform((v) => ({
        total: v.data.total ?? 0,
        bySeverity: Object.fromEntries(
          FLAG_SEVERITIES.map((severity) => [severity, v.data[severity] ?? 0]),
        ) as Record<FlagSeverity, number>,
      })),
    signal,
  });
}
