import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const base = adminPaths.financial;

const liquiditySchema = z.object({
  balance: decimal,
  currency: z.string().catch("NGN"),
  lastSynced: timestamp,
  /** Sum of every customer's naira wallet balance. */
  totalUserLiability: decimal,
  /** Settlement balance minus customer liability. */
  coverage: decimal,
  isUnderFunded: z.boolean().catch(false),
});
export type Liquidity = z.output<typeof liquiditySchema>;

/** Live settlement-account balance against what customers hold. */
export function fetchLiquidity(signal?: AbortSignal) {
  return adminApi.get(`${base}/nomba/balance`, {
    schema: z.object({ data: liquiditySchema }).transform((v) => v.data),
    signal,
    timeoutMs: 45_000,
  });
}

export const payoutProviderSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string().catch(""),
  bankName: nullableString,
  accountName: nullableString,
  environment: nullableString,
  isActive: z.boolean().catch(false),
  isDefault: z.boolean().catch(false),
  cachedBalance: decimal,
  lastSyncedAt: timestamp,
  hasApiKey: z.boolean().catch(false),
});
export type PayoutProvider = z.output<typeof payoutProviderSchema>;

/** Payout accounts with cached balances. Credentials never leave the API (masked there, dropped here). */
export function fetchPayoutProviders(signal?: AbortSignal) {
  return adminApi.get(`${base}/payout-providers`, {
    schema: z.object({ data: z.array(payoutProviderSchema) }).transform((v) => v.data),
    signal,
    timeoutMs: 45_000,
  });
}

const breakdownSchema = z.object({
  cryptoBuyCommissions: decimal,
  cryptoSaleCommissions: decimal,
  swapFees: decimal,
  transferFees: decimal,
  otherEarnings: decimal,
  total: decimal,
});
export type EarningsBreakdown = z.output<typeof breakdownSchema>;

export interface EarningsRange {
  /** ISO instants. */
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Earnings by category. The API sums in floating point, so these totals can
 * differ from an exact sum by a fraction of a kobo.
 */
export function fetchEarningsBreakdown(range: EarningsRange, signal?: AbortSignal) {
  return adminApi.get(`${base}/earnings/breakdown`, {
    query: { startDate: range.startDate ?? undefined, endDate: range.endDate ?? undefined },
    schema: z.object({ data: breakdownSchema }).transform((v) => v.data),
    signal,
  });
}

export const earningSchema = z.object({
  id: z.string(),
  transactionType: z.string().catch(""),
  userId: nullableString,
  coin: nullableString,
  cryptoAmount: decimal,
  nairaAmount: decimal,
  profit: decimal,
  adminRate: decimal,
  reference: nullableString,
  swapStrategy: nullableString,
  createdAt: timestamp,
});
export type Earning = z.output<typeof earningSchema>;

export const EARNING_TYPES = ["buy", "sell", "swap"] as const;

export function fetchEarnings(
  query: EarningsRange & { page: number; pageSize: number; transactionType?: string | null },
  signal?: AbortSignal,
) {
  return adminApi.get(`${base}/earnings`, {
    query: {
      page: query.page,
      limit: query.pageSize,
      transactionType: query.transactionType ?? undefined,
      startDate: query.startDate ?? undefined,
      endDate: query.endDate ?? undefined,
    },
    schema: z
      .object({ data: z.object({ earnings: z.array(earningSchema), total: z.coerce.number() }) })
      .transform((v) => ({ rows: v.data.earnings, total: v.data.total })),
    signal,
  });
}
