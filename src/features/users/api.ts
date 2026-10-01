import { z } from "zod";

import { STEP_UP_HEADER } from "@/features/security/api";
import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";
import { toDecimalString } from "@/lib/format";

const core = adminPaths.core;
const users = adminPaths.users;

/**
 * Allowlisted user fields. Anything the API returns beyond these (bvn, fcmToken,
 * provider IDs, device identifiers) is dropped during parsing and never reaches
 * a component, export or cache.
 */
const userBase = {
  id: z.string(),
  email: z.string(),
  firstName: z.string().catch(""),
  lastName: z.string().catch(""),
  userName: nullableString,
  phoneNumber: nullableString,
  isConfirmed: z.boolean().catch(false),
  isBlocked: z.boolean().catch(false),
  isSuspended: z.boolean().catch(false),
  outboundRestricted: z.boolean().catch(false),
  loginLockedUntil: timestamp,
  pinLockedUntil: timestamp,
  loginAttempts: z.number().catch(0),
  pinAttempts: z.number().catch(0),
  hasVerifiedBVN: z.boolean().catch(false),
  hasVerifiedNIN: z.boolean().catch(false),
  hasVerifiedAddress: z.boolean().catch(false),
  hasVerifiedGovernmentId: nullableString,
  level: z.number().catch(0),
  walletBalance: decimal,
  referralBalance: decimal,
  welcomeBonus: decimal,
  transactionCount: z.coerce.number().catch(0),
  createdAt: timestamp,
};

export const userDetailSchema = z.object({
  ...userBase,
  country: nullableString,
  dateOfBirth: nullableString,
  referralCode: nullableString,
  referredById: nullableString,
  reasonForBlock: nullableString,
  blockedAt: timestamp,
  suspensionReason: nullableString,
  suspendedAt: timestamp,
  outboundRestrictedReason: nullableString,
  outboundRestrictedAt: timestamp,
  hasActivated2FA: z.boolean().catch(false),
  hasVerifiedLiveness: z.boolean().catch(false),
  identityVerified: z.boolean().catch(false),
  lastLogin: timestamp,
  lastLoginIp: nullableString,
  loginCount: z.number().catch(0),
  deletedAt: timestamp,
  updatedAt: timestamp,
  bankDetails: z
    .array(z.object({ bankName: z.string(), accountNumber: z.string(), accountName: z.string() }))
    .catch([]),
  coinBalances: z
    .array(
      z.object({
        name: z.string(),
        ticker: z.string(),
        cryptoBalance: z.string().catch("0"),
        nairaBalance: decimal,
      }),
    )
    .catch([]),
});
export type UserDetail = z.output<typeof userDetailSchema>;

export const userListItemSchema = z.object({
  ...userBase,
  lastTransactionDate: timestamp,
  lastLogin: timestamp,
});
export type UserListItem = z.output<typeof userListItemSchema>;

export const USER_SEARCH_STATUSES = [
  "active",
  "blocked",
  "suspended",
  "frozen",
  "locked",
  "unconfirmed",
] as const;
/** Sort keys `GET /users/search` accepts. */
export const USER_SORT_KEYS = ["name", "createdAt", "walletBalance", "level", "lastLogin"] as const;

export interface UserQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  status?: (typeof USER_SEARCH_STATUSES)[number] | null;
  level?: string | null;
  sortBy?: (typeof USER_SORT_KEYS)[number];
  sortOrder?: "asc" | "desc";
}

/** Filters in the shape the search and export endpoints read. */
export function userFilters(query: Omit<UserQuery, "page" | "pageSize" | "sortBy" | "sortOrder">) {
  return {
    search: query.search || undefined,
    status: query.status ?? undefined,
    level: query.level ?? undefined,
  };
}

/**
 * Server-paginated customer list. Completed-transaction count and last
 * completed transaction are computed for the returned page only.
 */
export function searchUsers(query: UserQuery, signal?: AbortSignal) {
  return adminApi.get(`${core}/users/search`, {
    query: {
      ...userFilters(query),
      page: query.page,
      limit: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    },
    schema: z
      .object({
        data: z.array(userListItemSchema),
        pagination: z.object({ total: z.number() }),
      })
      .transform((v) => ({ rows: v.data, total: v.pagination.total })),
    signal,
  });
}

export function fetchUser(id: string, signal?: AbortSignal) {
  return adminApi.get(`${core}/get-user/${encodeURIComponent(id)}`, {
    schema: userDetailSchema,
    signal,
  });
}

const walletSchema = z.object({
  coinName: z.string(),
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
        withdrawsEnabled: z.boolean().catch(false),
      }),
    )
    .catch([]),
  balanceUnavailable: z.boolean().catch(false),
});
export type UserWallet = z.output<typeof walletSchema>;

export function fetchUserWallets(id: string, signal?: AbortSignal) {
  return adminApi.get(`${core}/user-wallet-addresses/${encodeURIComponent(id)}`, {
    schema: z.object({ wallets: z.array(walletSchema).catch([]) }).transform((v) => v.wallets),
    signal,
    timeoutMs: 45_000,
  });
}

const activitySchema = z.object({
  id: z.string(),
  action: z.string(),
  ipAddress: nullableString,
  deviceInfo: nullableString,
  location: nullableString,
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.string(),
});
export type UserActivity = z.output<typeof activitySchema>;

export function fetchUserActivity(
  id: string,
  { limit, offset }: { limit: number; offset: number },
  signal?: AbortSignal,
) {
  return adminApi.get(`${core}/user-activity/${encodeURIComponent(id)}`, {
    query: { limit, offset },
    schema: z.object({ logs: z.array(activitySchema), total: z.number() }),
    signal,
  });
}

/** Server-generated statement (CSV). HTML output is not used: it would render API-built markup on this origin. */
export function fetchUserStatementCsv(
  id: string,
  range: { from?: string; to?: string; allTime?: boolean },
) {
  return adminApi.get(`${core}/user-statement-download/${encodeURIComponent(id)}`, {
    query: {
      format: "csv",
      from: range.from,
      to: range.to,
      allTime: range.allTime ? "true" : undefined,
    },
    schema: z.string(),
    timeoutMs: 120_000,
  });
}

/* ─── Account controls (api/src/app/routes/users.ts) ────────────────────── */

/** The API only accepts BlockReason enum values for admin blocks. */
export const ADMIN_BLOCK_REASON = "blocked_by_admin";

/**
 * Every one of these requires `users.manage` AND a fresh authenticator code:
 * they cut a customer off from their own money (or restore access that fraud
 * controls removed), so the API wants evidence of who is at the keyboard now,
 * not just that a session was opened this morning. The lifting actions carry
 * the same bar as the imposing ones on purpose — quietly unfreezing an account
 * is the more valuable move for an attacker and the less likely to be noticed.
 */
/**
 * Either the authenticator code itself (one action) or a step-up grant
 * obtained from `startStepUp` (bulk runs, where a code would rotate mid-run).
 */
export type AccountControlStepUp = { twoFACode: string } | { grant: string };

/** Splits the credential into the body field or the header the API reads it from. */
function stepUpRequest(stepUp: AccountControlStepUp) {
  return "grant" in stepUp
    ? { body: {}, options: { headers: { [STEP_UP_HEADER]: stepUp.grant } } }
    : { body: { twoFACode: stepUp.twoFACode }, options: undefined };
}

export function blockUser(id: string, note: string, stepUp: AccountControlStepUp) {
  const { body, options } = stepUpRequest(stepUp);
  return adminApi.post(
    `${users}/blockUser/${encodeURIComponent(id)}`,
    { reason: ADMIN_BLOCK_REASON, note, ...body },
    options,
  );
}
export function unblockUser(id: string, stepUp: AccountControlStepUp) {
  const { body, options } = stepUpRequest(stepUp);
  return adminApi.post(`${users}/unblockUser/${encodeURIComponent(id)}`, body, options);
}
export function suspendUser(id: string, reason: string, stepUp: AccountControlStepUp) {
  const { body, options } = stepUpRequest(stepUp);
  return adminApi.post(
    `${users}/suspendUser/${encodeURIComponent(id)}`,
    { reason, ...body },
    options,
  );
}
export function unsuspendUser(id: string, stepUp: AccountControlStepUp) {
  const { body, options } = stepUpRequest(stepUp);
  return adminApi.post(`${users}/unsuspendUser/${encodeURIComponent(id)}`, body, options);
}
export function freezeUser(id: string, reason: string, stepUp: AccountControlStepUp) {
  const { body, options } = stepUpRequest(stepUp);
  return adminApi.post(
    `${users}/freezeUser/${encodeURIComponent(id)}`,
    { reason, ...body },
    options,
  );
}
export function unfreezeUser(id: string, stepUp: AccountControlStepUp) {
  const { body, options } = stepUpRequest(stepUp);
  return adminApi.post(`${users}/unfreezeUser/${encodeURIComponent(id)}`, body, options);
}

/* ─── Manual wallet adjustments ──────────────────────────────────────────── */

/**
 * Credit or debit a customer's naira wallet by hand.
 *
 * THE STRICTEST GATE IN THE CONSOLE, AND WHY
 *
 * A credit creates spendable balance with no settlement behind it. A debit takes
 * money out with no disbursement behind it and nothing the customer can point
 * at. So the API demands super admin, the account password, the transaction PIN
 * and a fresh authenticator code on every single call — four credentials, no
 * grants, no bulk path. It is also deliberately not behind a grantable
 * permission: invited staff can never hold it, in the same way they can never
 * hold wallets.withdraw.
 *
 * WHAT `recordTransaction` DOES NOT CONTROL
 *
 * Three records come out of an adjustment, and only one is optional:
 *
 *   • the wallet ledger entry — the evidence, with the balance either side.
 *     Always written.
 *   • the audit log entry — who authorised it. Always written.
 *   • the customer's statement line — whether this shows up in their own
 *     transaction history. THIS is the option.
 *
 * So turning it off does not make an adjustment untraceable, and the dialog says
 * so plainly: it exists for corrections the customer should not be invited to
 * interpret (reversing a credit issued twice, settling an internal rounding
 * difference), not for moving money quietly.
 */
export interface WalletAdjustment {
  amount: string;
  narration: string;
  /** Write a line into the customer's own transaction history. */
  recordTransaction: boolean;
  /** Send the customer a credit/debit alert. */
  notifyCustomer: boolean;
  password: string;
  pin: string;
  twoFACode: string;
}

const adjustmentResultSchema = z
  .object({
    message: z.string().catch(""),
    data: z
      .object({
        amount: z.unknown(),
        reference: z.string().catch(""),
        balanceBefore: z.unknown(),
        balanceAfter: z.unknown(),
        statementRowWritten: z.boolean().catch(true),
        customerNotified: z.boolean().catch(true),
      })
      .optional(),
  })
  .transform((v) => ({
    message: v.message,
    reference: v.data?.reference ?? null,
    balanceAfter: toDecimalString(v.data?.balanceAfter),
    balanceBefore: toDecimalString(v.data?.balanceBefore),
    statementRowWritten: v.data?.statementRowWritten ?? true,
    customerNotified: v.data?.customerNotified ?? true,
  }));
export type WalletAdjustmentResult = z.output<typeof adjustmentResultSchema>;

function adjustmentBody(userId: string, input: WalletAdjustment) {
  return {
    // The API resolves email, username or user ID. The console always sends the
    // id: it is opened from a customer's own page, and matching by email would
    // make an adjustment land on a different account if two records ever shared
    // one.
    identifier: userId,
    amount: input.amount,
    narration: input.narration.trim() || undefined,
    recordTransaction: input.recordTransaction,
    notifyCustomer: input.notifyCustomer,
    password: input.password,
    pin: input.pin,
    twoFACode: input.twoFACode,
  };
}

export function creditUserWallet(userId: string, input: WalletAdjustment) {
  return adminApi.post(`${core}/credit-user`, adjustmentBody(userId, input), {
    schema: adjustmentResultSchema,
  });
}

export function debitUserWallet(userId: string, input: WalletAdjustment) {
  return adminApi.post(`${core}/debit-user`, adjustmentBody(userId, input), {
    schema: adjustmentResultSchema,
  });
}

/**
 * The customer's naira ledger: every movement, with the balance either side.
 *
 * `gaps` is the important part. Each entry records `balanceBefore` and
 * `balanceAfter`, so any discontinuity between consecutive rows is a balance
 * change that bypassed the ledger entirely — which is exactly the untraceable
 * loss the ledger exists to surface, and the first thing to look at before
 * adjusting a balance by hand.
 */
const ledgerEntrySchema = z.object({
  id: z.string(),
  direction: z.enum(["CREDIT", "DEBIT"]).catch("CREDIT"),
  amountNaira: decimal,
  balanceBefore: decimal,
  balanceAfter: decimal,
  source: z.string().catch(""),
  reference: nullableString,
  narration: nullableString,
  createdAt: timestamp,
});
export type WalletLedgerEntry = z.output<typeof ledgerEntrySchema>;

export function fetchUserWalletLedger(userId: string, limit = 50, signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.ledger}/statement/${encodeURIComponent(userId)}`, {
    query: { limit },
    schema: z
      .object({
        data: z.object({
          entries: z.array(ledgerEntrySchema).catch([]),
          gaps: z.array(z.unknown()).catch([]),
          reconciles: z.boolean().catch(true),
        }),
      })
      .transform((v) => v.data),
    signal,
  });
}
