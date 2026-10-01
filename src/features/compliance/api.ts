import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const base = adminPaths.compliance;

export const ALERT_STATUSES = ["OPEN", "UNDER_REVIEW", "CLEARED", "ESCALATED", "REPORTED"] as const;
export const ALERT_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const MONITORING_RULES = [
  "VALUE_ABOVE_PROFILE",
  "STRUCTURING",
  "PASS_THROUGH",
  "MULTIPLE_FUNDING_SOURCES",
  "SHARED_DEVICE",
  "DORMANT_REACTIVATION",
  "HIGH_RISK_CRYPTO_DESTINATION",
  "INCONSISTENT_WITH_PROFILE",
  "VERIFICATION_PROBING",
  "HIGH_RISK_JURISDICTION",
  "SANCTIONS_HIT",
] as const;
/** Statuses an administrator may set; REPORTED is set by raising an STR. */
export const DISPOSITIONS = ["UNDER_REVIEW", "CLEARED", "ESCALATED"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const REPORT_STATUSES = [
  "INTERNAL_ESCALATION",
  "UNDER_ASSESSMENT",
  "NOT_REPORTED",
  "PENDING_FILING",
  "FILED",
] as const;
export const REPORT_TYPES = ["STR", "CTR"] as const;

export const RISK_RATINGS = ["LOW", "MEDIUM", "HIGH"] as const;
export const PEP_STATUSES = ["UNKNOWN", "NOT_PEP", "PEP", "PEP_ASSOCIATE"] as const;
export const SOURCES_OF_FUNDS = [
  "SALARY",
  "BUSINESS_INCOME",
  "SAVINGS",
  "INVESTMENT_RETURNS",
  "GIFT",
  "INHERITANCE",
  "LOAN",
  "SALE_OF_ASSET",
  "OTHER",
] as const;

const subjectSchema = z
  .object({
    id: z.string(),
    email: z.string().catch(""),
    userName: nullableString,
    firstName: z.string().catch(""),
    lastName: z.string().catch(""),
  })
  .nullish()
  .catch(null);
export type ComplianceSubject = z.output<typeof subjectSchema>;

const count = z.coerce.number().catch(0);

/* ─── Dashboard ──────────────────────────────────────────────────────────── */

const dashboardSchema = z.object({
  alerts: z.object({
    open: count,
    critical: count,
    oldestOpenAt: timestamp,
    oldestOpenAgeDays: z.number().nullish(),
  }),
  customers: z.object({ total: count, highRisk: count, pep: count, neverProfiled: count }),
  reports: z.object({ open: count, filed: count }),
});
export type ComplianceDashboard = z.output<typeof dashboardSchema>;

export function fetchComplianceDashboard(signal?: AbortSignal) {
  return adminApi.get(`${base}/dashboard`, {
    schema: z.object({ data: dashboardSchema }).transform((v) => v.data),
    signal,
  });
}

/* ─── Alerts ─────────────────────────────────────────────────────────────── */

export const alertSchema = z.object({
  id: z.string(),
  userId: z.string(),
  user: subjectSchema,
  rule: z.string(),
  severity: z.string(),
  status: z.string(),
  summary: z.string().catch(""),
  evidence: z.record(z.string(), z.unknown()).nullish().catch(null),
  reviewedBy: nullableString,
  reviewedAt: timestamp,
  reviewNote: nullableString,
  reportId: nullableString,
  createdAt: timestamp,
});
export type ComplianceAlert = z.output<typeof alertSchema>;

export interface AlertQuery {
  page: number;
  pageSize: number;
  status?: string | null;
  severity?: string | null;
  rule?: string | null;
  userId?: string | null;
}

/** Severity first, then newest. Page size is capped at 100 by the API. */
export function fetchAlerts(query: AlertQuery, signal?: AbortSignal) {
  return adminApi.get(`${base}/alerts`, {
    query: {
      page: query.page,
      limit: Math.min(query.pageSize, 100),
      status: query.status ?? undefined,
      severity: query.severity ?? undefined,
      rule: query.rule ?? undefined,
      userId: query.userId ?? undefined,
    },
    schema: z
      .object({ data: z.array(alertSchema), pagination: z.object({ total: count }) })
      .transform((v) => ({ rows: v.data, total: v.pagination.total })),
    signal,
  });
}

/* ─── Profile ────────────────────────────────────────────────────────────── */

export const complianceProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  riskRating: z.string().catch("LOW"),
  riskRationale: nullableString,
  riskRatingSetAt: timestamp,
  nextReviewAt: timestamp,
  lastReviewedAt: timestamp,
  pepStatus: z.string().catch("UNKNOWN"),
  pepNote: nullableString,
  pepDeterminedAt: timestamp,
  sourceOfFunds: nullableString,
  sourceOfFundsDetail: nullableString,
  sourceOfWealth: nullableString,
  occupation: nullableString,
  expectedMonthlyVolume: decimal,
  eddRequired: z.boolean().catch(false),
  eddCompleted: z.boolean().catch(false),
  updatedAt: timestamp,
});
export type ComplianceProfile = z.output<typeof complianceProfileSchema>;

export function fetchAlert(id: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/alerts/${encodeURIComponent(id)}`, {
    schema: z
      .object({
        data: z.object({
          alert: alertSchema,
          complianceProfile: complianceProfileSchema.nullish().catch(null),
          relatedAlerts: z.array(alertSchema.omit({ user: true })).catch([]),
        }),
      })
      .transform((v) => v.data),
    signal,
  });
}

export function dispositionAlert(id: string, input: { status: Disposition; note: string }) {
  return adminApi.post(`${base}/alerts/${encodeURIComponent(id)}/disposition`, input);
}

export const reportSchema = z.object({
  id: z.string(),
  reference: z.string(),
  userId: z.string(),
  user: subjectSchema,
  reportType: z.string(),
  status: z.string(),
  suspicionGrounds: z.string().catch(""),
  amountInvolved: decimal,
  raisedBy: nullableString,
  assessedAt: timestamp,
  assessmentRationale: nullableString,
  filedAt: timestamp,
  nfiuReference: nullableString,
  filingNote: nullableString,
  createdAt: timestamp,
});
export type ComplianceReport = z.output<typeof reportSchema>;

export function fetchComplianceProfile(userId: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/profile/${encodeURIComponent(userId)}`, {
    schema: z
      .object({
        data: z.object({
          profile: complianceProfileSchema,
          alerts: z.array(alertSchema.omit({ user: true })).catch([]),
          reports: z.array(reportSchema.omit({ user: true })).catch([]),
        }),
      })
      .transform((v) => v.data),
    signal,
  });
}

export interface ProfileUpdate {
  riskRating?: (typeof RISK_RATINGS)[number];
  /** Required (≥ 10 characters) when the rating changes. */
  riskRationale?: string;
  pepStatus?: (typeof PEP_STATUSES)[number];
  pepNote?: string;
  sourceOfFunds?: (typeof SOURCES_OF_FUNDS)[number];
  sourceOfFundsDetail?: string;
  occupation?: string;
}

/**
 * Step-up gated. This writes the customer's AML risk rating and PEP status —
 * the two fields that decide how closely the monitoring engine watches them.
 * Quietly re-rating a mule account to low risk is the most valuable edit
 * available to anyone holding a console session, and it moves no money, so
 * nothing else in the system would flag it.
 */
export function updateComplianceProfile(
  userId: string,
  input: ProfileUpdate & { twoFACode: string },
) {
  return adminApi.patch(`${base}/profile/${encodeURIComponent(userId)}`, input);
}

/* ─── STR register ───────────────────────────────────────────────────────── */

export interface ReportQuery {
  page: number;
  pageSize: number;
  status?: string | null;
  reportType?: string | null;
}

export function fetchReports(query: ReportQuery, signal?: AbortSignal) {
  return adminApi.get(`${base}/reports`, {
    query: {
      page: query.page,
      limit: Math.min(query.pageSize, 100),
      status: query.status ?? undefined,
      reportType: query.reportType ?? undefined,
    },
    schema: z
      .object({ data: z.array(reportSchema), pagination: z.object({ total: count }) })
      .transform((v) => ({ rows: v.data, total: v.pagination.total })),
    signal,
  });
}

export interface RaiseReportInput {
  userId: string;
  reportType: (typeof REPORT_TYPES)[number];
  /** At least 20 characters. */
  suspicionGrounds: string;
  amountInvolved?: string;
  /** Alerts to bind to the report; they become REPORTED. */
  alertIds?: string[];
}

export function raiseReport(input: RaiseReportInput) {
  return adminApi.post(`${base}/reports`, input, {
    schema: z.object({ message: z.string().catch("") }),
  });
}

export function assessReport(
  id: string,
  input: { decision: "REPORT" | "DO_NOT_REPORT"; rationale: string },
) {
  return adminApi.post(`${base}/reports/${encodeURIComponent(id)}/assess`, input);
}

/** Step-up gated: this asserts a report was submitted to the regulator, which nothing can walk back. */
export function fileReport(
  id: string,
  input: { nfiuReference: string; filingNote?: string; twoFACode: string },
) {
  return adminApi.post(`${base}/reports/${encodeURIComponent(id)}/file`, input);
}
