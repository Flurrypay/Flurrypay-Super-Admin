import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";

const base = adminPaths.notifications;

export const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  type: z.enum(["success", "warning", "error", "info"]).catch("info"),
  priority: z.enum(["high", "medium", "low"]).catch("medium"),
  targetRole: z.enum(["admin", "executive", "superAdmin", "all"]).catch("all"),
  read: z.boolean(),
  createdAt: z.string(),
});

export type AdminNotification = z.output<typeof notificationSchema>;

// The API returns `{ message }` without an array when there are none, and does not sort or limit.
const listSchema = z
  .object({ notifications: z.array(notificationSchema).optional() })
  .transform((v) => v.notifications ?? []);

export function fetchNotifications(signal?: AbortSignal) {
  return adminApi.get(base, { schema: listSchema, signal });
}

export function markNotificationRead(id: string) {
  return adminApi.patch(`${base}/read/${encodeURIComponent(id)}`);
}

export function markAllNotificationsRead() {
  return adminApi.patch(`${base}/read-all`);
}
