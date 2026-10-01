import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { nullableString, timestamp } from "@/lib/api/schema-helpers";

/**
 * The internal watchlist.
 *
 * Presented throughout as what it is: a list this business maintains, with a
 * named person and a stated reason behind every row. Entries sourced from an
 * external provider carry that provider's name, and the console shows it —
 * an internal suspicion and a third-party screening hit must never read as
 * the same kind of evidence.
 */

const base = adminPaths.risk;
const count = z.coerce.number().catch(0);
const messageSchema = z.object({ message: z.string().catch("") });

export const WATCHLIST_ENTITY_TYPES = [
  "USER",
  "BANK_ACCOUNT",
  "WALLET_ADDRESS",
  "DEVICE",
  "IP_ADDRESS",
  "PHONE",
  "EMAIL",
  "COUNTERPARTY_NAME",
] as const;
export type WatchlistEntityType = (typeof WATCHLIST_ENTITY_TYPES)[number];

export const WATCHLIST_CATEGORIES = [
  "CONFIRMED_FRAUD",
  "SUSPECTED_MULE",
  "AML_CONCERN",
  "CHARGEBACK_ABUSE",
  "LAW_ENFORCEMENT_REQUEST",
  "SCREENING_MATCH",
  "INTERNAL_REVIEW",
  "OTHER",
] as const;
export type WatchlistCategory = (typeof WATCHLIST_CATEGORIES)[number];

export const WATCHLIST_STATUSES = ["ACTIVE", "UNDER_REVIEW", "EXPIRED", "REMOVED"] as const;
export const WATCHLIST_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export const watchlistEntrySchema = z.object({
  id: z.string(),
  entityType: z.string().catch("USER"),
  entityValue: z.string().catch(""),
  label: nullableString,
  category: z.string().catch("INTERNAL_REVIEW"),
  severity: z.string().catch("MEDIUM"),
  status: z.string().catch("ACTIVE"),
  reason: z.string().catch(""),
  source: nullableString,
  sourceReference: nullableString,
  sourceScreenedAt: timestamp,
  matchCount: count,
  lastMatchedAt: timestamp,
  expiresAt: timestamp,
  caseId: nullableString,
  addedByEmail: nullableString,
  reviewedAt: timestamp,
  reviewNote: nullableString,
  removedAt: timestamp,
  removalReason: nullableString,
  createdAt: timestamp,
});
export type WatchlistEntry = z.output<typeof watchlistEntrySchema>;

const statsSchema = z.object({
  active: count,
  underReview: count,
  expiringSoon: count,
  neverMatched: count,
  matchesLast30Days: count,
  byCategory: z.array(z.object({ category: z.string().catch(""), count })).catch([]),
});
export type WatchlistStats = z.output<typeof statsSchema>;

export interface WatchlistQuery {
  entityType?: string | null;
  category?: string | null;
  status?: string | null;
  severity?: string | null;
  search?: string | null;
  page?: number;
  limit?: number;
}

export function fetchWatchlist(query: WatchlistQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.entityType) params.set("entityType", query.entityType);
  if (query.category) params.set("category", query.category);
  if (query.status) params.set("status", query.status);
  if (query.severity) params.set("severity", query.severity);
  if (query.search) params.set("search", query.search);
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 50));

  return adminApi.get(`${base}/watchlist?${params.toString()}`, {
    schema: z
      .object({
        data: z.array(watchlistEntrySchema).catch([]),
        pagination: z
          .object({ page: count, limit: count, total: count, pages: count })
          .catch({ page: 1, limit: 50, total: 0, pages: 0 }),
        stats: statsSchema.catch({
          active: 0,
          underReview: 0,
          expiringSoon: 0,
          neverMatched: 0,
          matchesLast30Days: 0,
          byCategory: [],
        }),
      })
      .transform((v) => ({ rows: v.data, ...v.pagination, stats: v.stats })),
    signal,
  });
}

export interface AddWatchlistInput {
  entityType: WatchlistEntityType;
  entityValue: string;
  label?: string;
  category: WatchlistCategory;
  severity: string;
  /** At least 10 characters — enforced by the API, not only here. */
  reason: string;
  source?: string;
  sourceReference?: string;
  expiresAt?: string;
  caseId?: string;
}

export function addWatchlistEntry(input: AddWatchlistInput) {
  return adminApi.post(`${base}/watchlist`, input, { schema: messageSchema });
}

export function reviewWatchlistEntry(
  id: string,
  input: { status: "ACTIVE" | "UNDER_REVIEW"; note: string },
) {
  return adminApi.post(`${base}/watchlist/${encodeURIComponent(id)}/review`, input);
}

/**
 * A status change, never a delete — the removal itself is part of the record.
 *
 * Sent through `request` rather than `delete` because the reason travels in
 * the body, and the typed `delete` helper deliberately has no body parameter.
 */
export function removeWatchlistEntry(id: string, reason: string) {
  return adminApi.request("DELETE", `${base}/watchlist/${encodeURIComponent(id)}`, {
    body: { reason },
    schema: messageSchema,
  });
}
