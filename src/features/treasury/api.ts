import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const base = adminPaths.financial;
const wallet = adminPaths.wallet;

/*
 * `GET /nomba/balance` is deliberately not called any more.
 *
 * It returns the settlement balance, the customer liability and the coverage —
 * all of which `/payout-providers/balances` also returns, alongside every other
 * account. Calling both meant the page could show a settlement figure from one
 * request beside a liability figure from another, and present the difference
 * between them as "coverage" as though the two had been read together.
 */

export const payoutProviderSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string().catch(""),
  bankName: nullableString,
  accountName: nullableString,
  /**
   * The company's own settlement account number.
   *
   * Kept — unlike a customer's account number, which is masked — because this
   * IS the top-up instruction: funding the float means transferring into this
   * account, and a masked number cannot be transferred to. The endpoint behind
   * it now requires `treasury.view`.
   */
  accountNumber: nullableString,
  bankCode: nullableString,
  environment: nullableString,
  isActive: z.boolean().catch(false),
  isDefault: z.boolean().catch(false),
  cachedBalance: decimal,
  lastSyncedAt: timestamp,
  hasApiKey: z.boolean().catch(false),
});
export type PayoutProvider = z.output<typeof payoutProviderSchema>;

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

/* ─── Every balance the company holds ────────────────────────────────────── */

/**
 * Fiat accounts, customer liability and coverage in one call.
 *
 * `/payout-providers/balances` already aggregates what three separate calls
 * used to assemble — the provider list, the live Nomba settlement figure and
 * the total customer liability — and does the coverage arithmetic server-side.
 * Using it means the three numbers on screen were read at the same instant,
 * which matters when the question is whether one covers the other.
 */
const treasuryBalancesSchema = z
  .object({
    data: z.object({
      providers: z.array(payoutProviderSchema).catch([]),
      activeProvider: payoutProviderSchema.nullish().catch(null),
      nombaSettlement: z
        .object({
          balance: decimal,
          currency: z.string().catch("NGN"),
          lastSynced: timestamp,
        })
        .nullish()
        .catch(null),
      totalUserLiability: decimal,
      coverage: decimal,
      isUnderFunded: z.boolean().catch(false),
    }),
  })
  .transform((v) => v.data);
export type TreasuryBalances = z.output<typeof treasuryBalancesSchema>;

export function fetchTreasuryBalances(signal?: AbortSignal) {
  return adminApi.get(`${base}/payout-providers/balances`, {
    schema: treasuryBalancesSchema,
    signal,
    // The API syncs a stale provider balance from the provider during this
    // call, so it can be as slow as the slowest upstream.
    timeoutMs: 45_000,
  });
}

/** Re-read one provider's balance from the provider itself. Moves no money. */
export function syncProviderBalance(providerId: string) {
  return adminApi.post(
    `${base}/payout-providers/sync-balance`,
    { providerId },
    { timeoutMs: 45_000 },
  );
}

/**
 * Point every customer payout at a different account.
 *
 * Super admin and a fresh authenticator code, server-side: this reroutes the
 * company's outgoing money, and a session left open is not evidence that the
 * person at the keyboard meant to do it.
 */
export function switchPayoutProvider(providerId: string, twoFACode: string) {
  return adminApi.post(`${base}/payout-providers/switch`, { providerId, twoFACode });
}

/* ─── Crypto reserves ────────────────────────────────────────────────────── */

export const cryptoReserveSchema = z.object({
  coinName: z.string().catch(""),
  coinTicker: z.string(),
  coinBalance: z
    .object({ cryptoBalance: z.string().catch("0"), nairaBalance: decimal, lastUpdated: timestamp })
    .catch({ cryptoBalance: "0", nairaBalance: null, lastUpdated: null }),
  networks: z
    .array(
      z.object({
        id: z.string(),
        address: z.string().catch(""),
        network: nullableString,
        networkId: nullableString,
        withdrawsEnabled: z.boolean().catch(false),
      }),
    )
    .catch([]),
  balanceUnavailable: z.boolean().catch(false),
});
export type CryptoReserve = z.output<typeof cryptoReserveSchema>;

/**
 * The company's own crypto wallets, with a deposit address per network.
 *
 * Those addresses are the top-up mechanism. There is no endpoint that moves
 * money into a reserve — funding one means sending to its address, exactly as
 * a customer funds theirs.
 */
export function fetchCryptoReserves(signal?: AbortSignal) {
  return adminApi.get(`${wallet}/get-wallets`, {
    schema: z
      .object({ wallets: z.array(cryptoReserveSchema).catch([]) })
      .transform((v) => v.wallets),
    signal,
    timeoutMs: 60_000,
  });
}

/** Re-read every reserve balance from the exchange. */
export function syncCryptoReserves() {
  return adminApi.post(`${wallet}/sync-balances`, undefined, { timeoutMs: 60_000 });
}

/* ─── Withdrawing from the reserves ──────────────────────────────────────── */

const withdrawalLimitSchema = z
  .object({
    data: z.object({
      limit: decimal,
      used: decimal,
      remaining: decimal,
      currency: z.string().catch("NGN"),
      windowHours: z.number().catch(24),
    }),
  })
  .transform((v) => v.data);
export type WithdrawalLimit = z.output<typeof withdrawalLimitSchema>;

/**
 * How much of the rolling 24-hour ceiling is left.
 *
 * Read before the form rather than discovered by being refused after filling
 * it in. The cap is per-admin and counts crypto sends and fiat withdrawals
 * together, so one number covers both.
 */
export function fetchWithdrawalLimit(signal?: AbortSignal) {
  return adminApi.get(`${wallet}/withdrawal-limit`, {
    schema: withdrawalLimitSchema,
    signal,
  });
}

/**
 * Who a destination belongs to, and what sending there costs.
 *
 * Called before the send so the irreversible part is on screen first: whether
 * the address is one of ours (internal, free) or outside the network (on-chain,
 * a real fee, no way back). A quote that cannot be fetched is reported as
 * unavailable rather than as free.
 */
const recipientSchema = z
  .object({
    success: z.boolean().catch(false),
    data: z
      .object({
        kind: z.enum(["internal", "external", "mismatch", "not_found"]).catch("external"),
        via: nullableString,
        onChain: z.boolean().catch(false),
        feeApplies: z.boolean().catch(false),
        recipientName: nullableString,
        recipientUserName: nullableString,
        address: nullableString,
        note: nullableString,
        message: nullableString,
        feeEstimate: z
          .object({ fee: decimal, currency: z.string().catch("") })
          .nullish()
          .catch(null),
      })
      .nullish()
      .catch(null),
  })
  .transform((v) => ({ ok: v.success, ...(v.data ?? {}) }));
export type ResolvedRecipient = z.output<typeof recipientSchema>;

export function resolveWithdrawalRecipient(
  input: { identifier: string; currency: string; network?: string | null },
  signal?: AbortSignal,
) {
  return adminApi.post(
    `${wallet}/resolve-recipient`,
    { identifier: input.identifier, currency: input.currency, network: input.network ?? undefined },
    { schema: recipientSchema, signal },
  );
}

export interface CryptoWithdrawal {
  currency: string;
  amount: string;
  /** An external address, or a Flurrypay username. Exactly one. */
  address?: string | null;
  userName?: string | null;
  network?: string | null;
  password: string;
  pin: string;
  twoFACode: string;
}

/**
 * Move crypto out of a company reserve.
 *
 * Super admin only and never grantable to staff (`wallets.withdraw` is excluded
 * from the staff set entirely), plus password, PIN and a fresh authenticator
 * code, plus a server-computed NGN value checked against the daily ceiling —
 * the client's own naira figure is never trusted for that check.
 */
export function withdrawFromReserve(input: CryptoWithdrawal) {
  return adminApi.post(
    `${wallet}/withdrawal`,
    {
      currency: input.currency,
      amount: input.amount,
      address: input.address || undefined,
      userName: input.userName || undefined,
      network: input.network || undefined,
      password: input.password,
      pin: input.pin,
      twoFACode: input.twoFACode,
    },
    { timeoutMs: 120_000 },
  );
}

/* ─── Treasury movements ─────────────────────────────────────────────────── */

export const TRANSFER_DIRECTIONS = ["Inwards", "Outwards"] as const;
export const TRANSFER_STATUSES = ["Completed", "Pending", "Failed"] as const;

export const treasuryMovementSchema = z.object({
  id: z.string(),
  transferDirection: z.string().catch(""),
  transferType: z.string().catch("OTHER"),
  status: z.string().catch(""),
  amount: decimal,
  fees: decimal,
  vat: decimal,
  narration: nullableString,
  paymentReference: nullableString,
  counterpartyAccountName: nullableString,
  counterpartyAccountNumber: nullableString,
  counterpartyBankName: nullableString,
  relatedUserId: nullableString,
  createdAt: timestamp,
});
export type TreasuryMovement = z.output<typeof treasuryMovementSchema>;

/** Money in and out of the company's own accounts. */
export function fetchTreasuryMovements(
  query: {
    page: number;
    pageSize: number;
    direction?: (typeof TRANSFER_DIRECTIONS)[number] | null;
    status?: (typeof TRANSFER_STATUSES)[number] | null;
    startDate?: string | null;
    endDate?: string | null;
  },
  signal?: AbortSignal,
) {
  return adminApi.get(`${base}/transfers`, {
    query: {
      page: query.page,
      limit: query.pageSize,
      direction: query.direction ?? undefined,
      status: query.status ?? undefined,
      startDate: query.startDate ?? undefined,
      endDate: query.endDate ?? undefined,
    },
    schema: z
      .object({
        data: z.object({
          transfers: z.array(treasuryMovementSchema).catch([]),
          total: z.coerce.number().catch(0),
        }),
      })
      .transform((v) => ({ rows: v.data.transfers, total: v.data.total })),
    signal,
  });
}
