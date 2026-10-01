import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { nullableString, timestamp } from "@/lib/api/schema-helpers";

/**
 * Rule configuration: the part of a detection rule that is a policy decision
 * rather than an algorithm. Detection logic stays in the engine; what is
 * editable here is whether a rule is on, whether it is merely observing, and
 * what its signal is worth.
 */

const base = adminPaths.risk;
const messageSchema = z.object({ message: z.string().catch("") });

export const RULE_STATUSES = ["ACTIVE", "SHADOW", "PAUSED", "DRAFT", "ARCHIVED"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

/**
 * What each status means operationally, for the console to explain itself.
 *
 * Keyed by string rather than RuleStatus: the status arrives from the API and
 * a value this build does not know about must degrade to a fallback, not to a
 * blank cell that reads as "no status".
 */
export const RULE_STATUS_HELP: Record<string, string | undefined> = {
  ACTIVE: "Evaluated, recorded, and contributing to the risk score.",
  SHADOW:
    "Evaluated and recorded, but contributing zero points. Use this to measure a rule before it can hold anyone's money.",
  PAUSED: "Evaluated but discarded. The rule contributes nothing and raises nothing.",
  DRAFT: "Configured but not applied to live scoring.",
  ARCHIVED: "Retired. Kept for history only.",
};

export const RULE_STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "neutral" | undefined
> = {
  ACTIVE: "success",
  SHADOW: "info",
  PAUSED: "warning",
  DRAFT: "neutral",
  ARCHIVED: "neutral",
};

const ruleSchema = z.object({
  ruleKey: z.string(),
  displayName: z.string().catch(""),
  description: z.string().catch(""),
  status: z.string().catch("ACTIVE"),
  pointsOverride: z.number().nullish().catch(null),
  params: z.record(z.string(), z.unknown()).nullish().catch(null),
  version: z.coerce.number().catch(0),
  /** False means no stored row — the rule runs at its coded defaults. */
  configured: z.boolean().catch(false),
  updatedAt: timestamp,
  updatedByAdminId: nullableString,
});
export type RiskRule = z.output<typeof ruleSchema>;

export function fetchRules(signal?: AbortSignal) {
  return adminApi.get(`${base}/rules`, {
    schema: z.object({ data: z.array(ruleSchema).catch([]) }).transform((v) => v.data),
    signal,
  });
}

const versionSchema = z.object({
  id: z.string().catch(""),
  version: z.coerce.number().catch(0),
  status: z.string().catch(""),
  pointsOverride: z.number().nullish().catch(null),
  changeReason: z.string().catch(""),
  changedByEmail: nullableString,
  createdAt: timestamp,
});
export type RuleVersion = z.output<typeof versionSchema>;

export function fetchRuleVersions(ruleKey: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/rules/${encodeURIComponent(ruleKey)}/versions`, {
    schema: z.object({ data: z.array(versionSchema).catch([]) }).transform((v) => v.data),
    signal,
  });
}

export interface RuleUpdate {
  status?: RuleStatus;
  pointsOverride?: number | null;
  changeReason: string;
  /** Step-up credentials: the endpoint requires password and 2FA. */
  password?: string;
  twoFACode?: string;
}

export function updateRule(ruleKey: string, input: RuleUpdate) {
  return adminApi.patch(`${base}/rules/${encodeURIComponent(ruleKey)}`, input, {
    schema: messageSchema,
  });
}

const simulationSchema = z.object({
  ruleKey: z.string().catch(""),
  windowDays: z.coerce.number().catch(0),
  assessmentsWhereRuleFired: z.coerce.number().catch(0),
  assessmentsWithChangedScore: z.coerce.number().catch(0),
  averageScoreDelta: z.coerce.number().catch(0),
  bandMovements: z.record(z.string(), z.coerce.number()).catch({}),
  truncated: z.boolean().catch(false),
  caveat: z.string().catch(""),
});
export type RuleSimulation = z.output<typeof simulationSchema>;

export function simulateRule(
  ruleKey: string,
  input: { status?: RuleStatus; pointsOverride?: number | null; days?: number },
) {
  return adminApi.post(`${base}/rules/${encodeURIComponent(ruleKey)}/simulate`, input, {
    schema: z.object({ data: simulationSchema }).transform((v) => v.data),
  });
}
