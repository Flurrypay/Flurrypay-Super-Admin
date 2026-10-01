import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal } from "@/lib/api/schema-helpers";

const core = adminPaths.core;

/** The API rejects ranges longer than this. */
export const REPORT_MAX_DAYS = 366;

export interface ReportRange {
  /** ISO instants. */
  from: string;
  to: string;
}

const count = z.coerce.number().catch(0);

const transactionsReportSchema = z.object({
  timeZone: z.string().catch("Africa/Lagos"),
  breakdown: z.array(
    z.object({
      type: z.string().catch(""),
      status: z.string().catch(""),
      currency: z.string().catch(""),
      count,
      totalAmount: decimal,
      totalFee: decimal,
    }),
  ),
  daily: z.array(z.object({ day: z.string(), count, completed: count, failed: count })),
});
export type TransactionsReport = z.output<typeof transactionsReportSchema>;

/**
 * Totals by type, status and currency, plus a per-day series. Days are WAT
 * calendar days computed by the database; sums are exact decimal strings.
 */
export function fetchTransactionsReport(range: ReportRange, signal?: AbortSignal) {
  return adminApi.get(`${core}/reports/transactions`, {
    query: { from: range.from, to: range.to },
    schema: transactionsReportSchema,
    signal,
    timeoutMs: 60_000,
  });
}

const usersReportSchema = z.object({
  timeZone: z.string().catch("Africa/Lagos"),
  signups: z.array(z.object({ day: z.string(), count })),
  levels: z.array(z.object({ level: count, count })),
  totals: z.object({
    total: count,
    confirmed: count,
    blocked: count,
    suspended: count,
    frozen: count,
    locked: count,
  }),
});
export type UsersReport = z.output<typeof usersReportSchema>;

/** Sign-ups per WAT day in the range, plus all-time KYC levels and account-state totals. */
export function fetchUsersReport(range: ReportRange, signal?: AbortSignal) {
  return adminApi.get(`${core}/reports/users`, {
    query: { from: range.from, to: range.to },
    schema: usersReportSchema,
    signal,
    timeoutMs: 60_000,
  });
}
