import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

/**
 * The monitoring layer, as opposed to its outcomes.
 *
 * `api.ts` covers cases and holds — the things the risk engine decided to do.
 * This covers the engine itself: every event it scored (including the ones it
 * passed), which rules are actually firing, the baseline a customer is being
 * measured against, and whether the thing is still running at all. The API has
 * exposed all of it for some time; none of it was reachable from the console,
 * so "is this customer being monitored?" had no answer on screen.
 */

const base = adminPaths.risk;
const count = z.coerce.number().catch(0);
const messageSchema = z.object({ message: z.string().catch("") });

/**
 * The rule keys the risk engine writes into `risk_assessments.signals[].rule`
 * (api/src/app/services/riskEngine.service.ts).
 *
 * Deliberately NOT the MonitoringRule enum from compliance. Those are the ten
 * policy parameters of AML/CFT-001, raised as compliance alerts; these are the
 * engine's own scoring signals. The two vocabularies overlap on four names and
 * are otherwise different, so filtering assessments by a MonitoringRule value
 * silently matches nothing.
 */
export const ENGINE_RULES = [
  "AMOUNT_VS_BASELINE",
  "FIRST_TIME_CREDIT_SIZE",
  "RAPID_PASS_THROUGH",
  "NEW_BENEFICIARY",
  "NO_DEVICE_IDENTITY",
  "UNTRUSTED_DEVICE",
  "UNUSUAL_HOUR",
  "VELOCITY",
  "MULTIPLE_FUNDING_SOURCES",
  "STRUCTURING",
  "VERIFICATION_PROBING",
  "HIGH_RISK_JURISDICTION",
  "WATCHLIST_MATCH",
  "THIRD_PARTY_FUNDING",
] as const;
export type EngineRule = (typeof ENGINE_RULES)[number];

/** api/src/app/models/riskAssessment.ts — RiskAction. */
export const RISK_ACTIONS = [
  "ALLOW",
  "ALLOW_MONITORED",
  "STEP_UP",
  "HOLD_TRANSACTION",
  "RESTRICT_OUTBOUND",
  "FREEZE_ACCOUNT",
] as const;
export type RiskActionName = (typeof RISK_ACTIONS)[number];

/**
 * Actions that stopped or constrained something, as opposed to merely
 * recording it. Used to separate "the engine intervened" from "the engine
 * looked" — a distinction the raw counts hide.
 */
export const INTERVENING_ACTIONS: readonly RiskActionName[] = [
  "STEP_UP",
  "HOLD_TRANSACTION",
  "RESTRICT_OUTBOUND",
  "FREEZE_ACCOUNT",
];

const signalSchema = z.object({
  rule: z.string().catch(""),
  points: z.coerce.number().catch(0),
  detail: z.string().catch(""),
  evidence: z.record(z.string(), z.unknown()).nullish().catch(null),
});
export type RiskSignal = z.output<typeof signalSchema>;

const assessmentUserSchema = z
  .object({
    email: nullableString,
    firstName: nullableString,
    lastName: nullableString,
    userName: nullableString,
  })
  .nullish()
  .catch(null);

export const assessmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  user: assessmentUserSchema,
  eventType: z.string().catch(""),
  amountNaira: decimal,
  riskScore: z.coerce.number().catch(0),
  action: z.string().catch("ALLOW"),
  signals: z.array(signalSchema).catch([]),
  transactionReference: nullableString,
  createdAt: timestamp,
});
export type RiskAssessment = z.output<typeof assessmentSchema>;

export interface AssessmentQuery {
  action?: string | null;
  rule?: string | null;
  userId?: string | null;
  eventType?: string | null;
  minScore?: number | null;
  page?: number;
  limit?: number;
}

export interface AssessmentPage {
  rows: RiskAssessment[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function fetchAssessments(
  query: AssessmentQuery,
  signal?: AbortSignal,
): Promise<AssessmentPage> {
  const params = new URLSearchParams();
  if (query.action) params.set("action", query.action);
  if (query.rule) params.set("rule", query.rule);
  if (query.userId) params.set("userId", query.userId);
  if (query.eventType) params.set("eventType", query.eventType);
  if (query.minScore) params.set("minScore", String(query.minScore));
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 50));

  return adminApi.get(`${base}/assessments?${params.toString()}`, {
    schema: z
      .object({
        data: z.array(assessmentSchema).catch([]),
        pagination: z
          .object({ page: count, limit: count, total: count, pages: count })
          .catch({ page: 1, limit: 50, total: 0, pages: 0 }),
      })
      .transform((v) => ({ rows: v.data, ...v.pagination })),
    signal,
  });
}

const statsSchema = z.object({
  windowDays: count,
  assessed: count,
  averageScore: z.coerce.number().catch(0),
  byAction: z.array(z.object({ action: z.string().catch(""), count })).catch([]),
  byRule: z
    .array(
      z.object({
        rule: z.string().catch(""),
        count,
        avgPoints: z.coerce.number().catch(0),
      }),
    )
    .catch([]),
});
export type AssessmentStats = z.output<typeof statsSchema>;

export function fetchAssessmentStats(days: number, signal?: AbortSignal) {
  return adminApi.get(`${base}/assessments/stats?days=${days}`, {
    schema: z.object({ data: statsSchema }).transform((v) => v.data),
    signal,
  });
}

// ── Customer risk profile ───────────────────────────────────────────

const baselineSchema = z.object({
  established: z.boolean().catch(false),
  sampleSize: count,
  medianAmount: z.coerce.number().catch(0),
  p95Amount: z.coerce.number().catch(0),
  maxAmount: z.coerce.number().catch(0),
  maxCreditReceived: z.coerce.number().catch(0),
  avgTransactionsPerDay: z.coerce.number().catch(0),
  maxTransactionsInDay: count,
  activeHours: z.array(z.coerce.number()).nullish().catch(null),
  distinctBeneficiaries: count,
  lastComputedAt: timestamp,
});
export type RiskBaseline = z.output<typeof baselineSchema>;

const userRiskSchema = z.object({
  user: z
    .object({
      id: z.string().catch(""),
      email: nullableString,
      firstName: nullableString,
      lastName: nullableString,
      walletBalance: decimal,
      level: z.unknown().nullish(),
      createdAt: timestamp,
    })
    .nullish()
    .catch(null),
  balance: z
    .object({
      balance: z.coerce.number().catch(0),
      held: z.coerce.number().catch(0),
      spendable: z.coerce.number().catch(0),
    })
    .catch({ balance: 0, held: 0, spendable: 0 }),
  baseline: baselineSchema,
  recentAssessments: z.array(assessmentSchema.partial({ user: true })).catch([]),
  cases: z
    .array(
      z.object({
        id: z.string().catch(""),
        reference: z.string().catch(""),
        status: z.string().catch(""),
        severity: z.string().catch(""),
        trigger: z.string().catch(""),
        createdAt: timestamp,
      }),
    )
    .catch([]),
});
export type UserRiskProfile = z.output<typeof userRiskSchema>;

export function fetchUserRisk(userId: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/user/${encodeURIComponent(userId)}`, {
    schema: z.object({ data: userRiskSchema }).transform((v) => v.data),
    signal,
  });
}

export function recomputeBaseline(userId: string) {
  return adminApi.post(
    `${base}/user/${encodeURIComponent(userId)}/recompute`,
    {},
    { schema: messageSchema },
  );
}

// ── Engine health ───────────────────────────────────────────────────

/**
 * A monitoring system that has quietly stopped evaluating is worse than none,
 * because everyone downstream still believes it is watching. These are the
 * numbers that would show it: queue depth, how old the solvency figures are,
 * and whether the sweep is marked active.
 */
const flaggedAccountSchema = z.object({
  id: z.string().catch(""),
  email: nullableString,
  firstName: nullableString,
  lastName: nullableString,
  userName: nullableString,
  phoneNumber: nullableString,
  walletBalance: decimal,
  outboundRestricted: z.boolean().catch(false),
  outboundRestrictedReason: nullableString,
  outboundRestrictedAt: timestamp,
  isSuspended: z.boolean().catch(false),
  isBlocked: z.boolean().catch(false),
  createdAt: timestamp,
});
export type FlaggedAccount = z.output<typeof flaggedAccountSchema>;

const engineHealthSchema = z.object({
  activeDirtyQueueSize: count,
  // Shape varies by provider mix; only the fields the console renders are
  // pinned, and the rest is left alone rather than guessed at.
  solvencyReport: z
    .object({
      overallStatus: z.string().nullish().catch(null),
      activeCustomersCount: count,
    })
    .nullish()
    .catch(null),
  solvencyGeneratedAt: timestamp,
  solvencyAgeMs: z.coerce.number().nullish().catch(null),
  flaggedAccountsCount: count,
  flaggedAccounts: z.array(flaggedAccountSchema).catch([]),
  systemStatus: z
    .object({
      activePassInterval: z.string().catch(""),
      platformPassInterval: z.string().catch(""),
      active: z.boolean().catch(false),
    })
    .catch({ activePassInterval: "", platformPassInterval: "", active: false }),
});
export type EngineHealth = z.output<typeof engineHealthSchema>;

export function fetchEngineHealth(signal?: AbortSignal) {
  return adminApi.get(`${base}/continuous-monitor/overview`, {
    schema: z.object({ data: engineHealthSchema }).transform((v) => v.data),
    signal,
  });
}

export const RESTRICTION_ACTIONS = [
  "UNLOCK_OUTBOUND",
  "UNSUSPEND",
  "UNBLOCK",
  "CLEAR_ALL_RESTRICTIONS",
] as const;
export type RestrictionAction = (typeof RESTRICTION_ACTIONS)[number];

export function resolveRestriction(input: {
  userId: string;
  action: RestrictionAction;
  reason: string;
}) {
  return adminApi.post(`${base}/continuous-monitor/resolve-restriction`, input, {
    schema: messageSchema,
  });
}
