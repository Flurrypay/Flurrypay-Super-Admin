import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { nullableString } from "@/lib/api/schema-helpers";

const base = `${adminPaths.financial}/audit-logs`;

const stateSnapshot = z
  .record(z.string(), z.unknown())
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

export const auditEntrySchema = z.object({
  id: z.string(),
  adminId: z.string(),
  adminEmail: z.string(),
  action: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish().catch(null),
  ipAddress: nullableString,
  userAgent: nullableString,
  /** Structured target, reason and request ID; absent on entries written before they existed. */
  targetType: nullableString,
  targetId: nullableString,
  reason: nullableString,
  requestId: nullableString,
  /** State of the changed record before and after the action, where the API records it. */
  before: stateSnapshot,
  after: stateSnapshot,
  createdAt: z.string(),
});
export type AuditEntry = z.output<typeof auditEntrySchema>;

export interface AuditQuery {
  page: number;
  pageSize: number;
  action?: string | null;
  adminId?: string | null;
  /** Exact match on the structured target ID. */
  targetId?: string | null;
  /** ISO instants, inclusive. */
  from?: string | null;
  to?: string | null;
  /** Matches admin email, action, IP and metadata text (ILIKE). */
  search?: string;
}

/** Filters in the shape the list and export endpoints read. */
export function auditFilters(query: Omit<AuditQuery, "page" | "pageSize">) {
  return {
    action: query.action ?? undefined,
    adminId: query.adminId ?? undefined,
    targetId: query.targetId ?? undefined,
    from: query.from ?? undefined,
    to: query.to ?? undefined,
    search: query.search?.trim() || undefined,
  };
}

/** Offset-paginated (limit ≤ 200). */
export function fetchAuditLog(query: AuditQuery, signal?: AbortSignal) {
  return adminApi.get(base, {
    query: {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      ...auditFilters(query),
    },
    schema: z
      .object({ data: z.array(auditEntrySchema), total: z.number() })
      .transform((v) => ({ rows: v.data, total: v.total })),
    signal,
  });
}

/** All-time count per action. */
export function fetchAuditStats(signal?: AbortSignal) {
  return adminApi.get(`${base}/stats`, {
    schema: z.object({ data: z.record(z.string(), z.number()) }).transform((v) => v.data),
    signal,
  });
}
