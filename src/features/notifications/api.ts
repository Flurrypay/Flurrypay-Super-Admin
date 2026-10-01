import type { Route } from "next";
import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";

const base = adminPaths.notifications;

/**
 * Subjects the API records on a notification (api/src/core/@types AdminNotificationEntity).
 *
 * Parsed permissively on purpose: an API that learns to point at something this
 * build has never heard of must not make the whole notification unreadable. An
 * unrecognised value becomes null and the notification renders without a link.
 */
export const NOTIFICATION_ENTITIES = [
  "user",
  "transaction",
  "case",
  "alert",
  "kyc",
  "supportMessage",
  "chatRoom",
  "stranded",
  "treasury",
] as const;
export type NotificationEntity = (typeof NOTIFICATION_ENTITIES)[number];

export const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  type: z.enum(["success", "warning", "error", "info"]).catch("info"),
  priority: z.enum(["high", "medium", "low"]).catch("medium"),
  targetRole: z.enum(["admin", "executive", "superAdmin", "all"]).catch("all"),
  read: z.boolean(),
  entityType: z.enum(NOTIFICATION_ENTITIES).nullish().catch(null),
  entityId: z.string().nullish().catch(null),
  link: z.string().nullish().catch(null),
  createdAt: z.string(),
});

export type AdminNotification = z.output<typeof notificationSchema>;

/**
 * The API returns `{ notifications, unread, pagination }`.
 *
 * `.optional()` on every part because an older API build answers an empty inbox
 * with `{ message: "No notifications found" }` and no array at all — this console
 * may be deployed in front of either.
 */
const listSchema = z
  .object({
    notifications: z.array(notificationSchema).optional(),
    unread: z.number().optional(),
    pagination: z.object({ total: z.number(), page: z.number(), limit: z.number() }).optional(),
  })
  .transform((v) => ({
    rows: v.notifications ?? [],
    total: v.pagination?.total ?? v.notifications?.length ?? 0,
    // Falls back to counting the page when the API does not report a total:
    // wrong for a later page, and the only number available there.
    unread: v.unread ?? (v.notifications ?? []).filter((n) => !n.read).length,
  }));

export interface NotificationQuery {
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
}

/** The bell: newest first, one short page. */
export function fetchNotifications(signal?: AbortSignal) {
  return adminApi.get(base, {
    query: { page: 1, limit: BELL_LIMIT },
    schema: listSchema,
    signal,
  });
}

/** The full page: server-paginated, optionally unread only. */
export function fetchNotificationPage(query: NotificationQuery, signal?: AbortSignal) {
  return adminApi.get(base, {
    query: {
      page: query.page,
      limit: query.pageSize,
      unread: query.unreadOnly ? "true" : undefined,
    },
    schema: listSchema,
    signal,
  });
}

/** How many the bell holds. The full list is at /notifications. */
export const BELL_LIMIT = 20;

export function markNotificationRead(id: string) {
  return adminApi.patch(`${base}/read/${encodeURIComponent(id)}`);
}

export function markAllNotificationsRead() {
  return adminApi.patch(`${base}/read-all`);
}

/* ─── Where a notification goes ──────────────────────────────────────────── */

/**
 * The console route a notification points at, or null when it points nowhere.
 *
 * WHY THIS IS A WHITELIST AND NOT `notification.link`
 *
 * `link` arrives from the API, and the API's notification rows are written by a
 * dozen call sites including webhook handlers that process third-party payloads.
 * Rendering it straight into an `href` would make "navigate the admin's browser
 * somewhere" a thing an upstream payload could eventually influence. So an
 * absolute URL, a protocol-relative one, or anything that is not a single
 * console-relative path is refused outright, and `entityType`/`entityId` — which
 * can only ever produce a route this file constructs — is preferred over it.
 *
 * The cost of being wrong here is an admin session following a link somebody
 * else chose. The cost of the whitelist is that a new alert target needs a line
 * added below, which is a trade worth making every time.
 */
export function notificationTarget(notification: AdminNotification): Route | null {
  const fromEntity = entityRoute(notification.entityType, notification.entityId);
  if (fromEntity) return fromEntity;
  return safeInternalPath(notification.link);
}

function entityRoute(
  entityType: AdminNotification["entityType"],
  entityId: AdminNotification["entityId"],
): Route | null {
  if (!entityType) return null;

  // Screens that need no id. Stranded transfers are one of them: that view has
  // no per-reference deep link, and sending a reference it ignores would put a
  // parameter in the URL that quietly does nothing.
  if (entityType === "treasury") return "/treasury";
  if (entityType === "stranded") return "/operations/stranded";

  if (!entityId) return null;
  const id = encodeURIComponent(entityId);

  switch (entityType) {
    case "user":
      return `/users/${id}` as Route;
    case "kyc":
      // The customer's own KYC tab, not the queue: the alert is about one
      // submission, and dropping the admin into a queue of forty makes them
      // search for the name they were just told.
      return `/users/${id}?tab=kyc` as Route;
    case "transaction":
      return `/transactions/${id}` as Route;
    case "case":
      return `/risk?tab=cases&case=${id}` as Route;
    case "alert":
      return `/compliance?tab=alerts&alert=${id}` as Route;
    case "supportMessage":
      // The API prefixes these "appeal:<id>" or "contact:<id>" because the inbox
      // merges two tables and a bare id is ambiguous between them.
      return `/support?tab=inbox&message=${id}` as Route;
    case "chatRoom":
      return `/support?tab=chat&room=${id}` as Route;
    default:
      return null;
  }
}

/**
 * A console-relative path, or null.
 *
 * Must start with a single "/" and must not start with "//" (which a browser
 * reads as a protocol-relative URL to another host). Anything with a scheme, a
 * backslash, or a control character is refused rather than sanitised — guessing
 * at what a malformed link meant is how a bypass gets written.
 */
function safeInternalPath(value: string | null | undefined): Route | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (/[\\\u0000-\u001f]/.test(path)) return null;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  return path as Route;
}
