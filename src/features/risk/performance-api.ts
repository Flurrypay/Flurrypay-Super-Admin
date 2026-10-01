import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { timestamp } from "@/lib/api/schema-helpers";

/**
 * Whether each rule is earning its place.
 *
 * Two populations, reported side by side and never summed: AML monitoring
 * alerts (which have outcomes, because a human dispositions each one) and
 * risk-engine signals (which have interventions, because the engine acts on a
 * combined score). Merging them would produce a number that means nothing.
 */

const base = adminPaths.risk;
const count = z.coerce.number().catch(0);
/**
 * A rate or duration that is legitimately absent — nothing dispositioned yet,
 * nothing open. Settles on null rather than undefined so render sites need one
 * check, not two.
 */
const rate = z.coerce
  .number()
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

const alertRuleSchema = z.object({
  rule: z.string().catch(""),
  configuredStatus: z.string().nullish().catch(null),
  triggered: count,
  open: count,
  underReview: count,
  cleared: count,
  escalated: count,
  reported: count,
  clearanceRate: rate,
  escalationRate: rate,
  averageHoursToDisposition: rate,
  oldestOpenHours: rate,
  lastTriggeredAt: timestamp,
});
export type AlertRulePerformance = z.output<typeof alertRuleSchema>;

const engineSignalSchema = z.object({
  rule: z.string().catch(""),
  configuredStatus: z.string().nullish().catch(null),
  fired: count,
  averagePoints: z.coerce.number().catch(0),
  interventions: count,
  shadowFires: count,
  lastFiredAt: timestamp,
});
export type EngineSignalPerformance = z.output<typeof engineSignalSchema>;

const fatigueSchema = z.object({
  rule: z.string().catch(""),
  reason: z.string().catch(""),
  alertsInWindow: count,
  clearanceRate: rate,
});
export type FatigueWarning = z.output<typeof fatigueSchema>;

const reportSchema = z.object({
  windowDays: count,
  generatedAt: timestamp,
  alertRules: z.array(alertRuleSchema).catch([]),
  engineSignals: z.array(engineSignalSchema).catch([]),
  fatigue: z.array(fatigueSchema).catch([]),
  totals: z
    .object({
      alertsRaised: count,
      alertsDispositioned: count,
      alertsOpen: count,
      overallClearanceRate: rate,
      medianHoursToDisposition: rate,
    })
    .catch({
      alertsRaised: 0,
      alertsDispositioned: 0,
      alertsOpen: 0,
      overallClearanceRate: null,
      medianHoursToDisposition: null,
    }),
});
export type RulePerformanceReport = z.output<typeof reportSchema>;

export function fetchRulePerformance(days: number, signal?: AbortSignal) {
  return adminApi.get(`${base}/rules/performance?days=${days}`, {
    schema: z.object({ data: reportSchema }).transform((v) => v.data),
    signal,
  });
}
