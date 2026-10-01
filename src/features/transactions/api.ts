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
 * Columns the table may sort by. The API interpolates `sortBy` into SQL without
 * a whitelist (docs/03-gaps-and-security.md S5), so the UI never sends anything else.
 */
export const TRANSACTION_SORT_KEYS = ["createdAt", "amount", "status", "transactionType"] as const;

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
