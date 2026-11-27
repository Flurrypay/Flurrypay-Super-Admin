import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { nullableString, timestamp } from "@/lib/api/schema-helpers";

const support = adminPaths.support;
const chat = adminPaths.chat;

/* ─── Inbox: appeals and contact-us messages ─────────────────────────────── */

/**
 * The API merges two tables into one list (api/src/app/controllers/adminSupportController.ts):
 * `appeal` — someone locked out trying to get their account back — and
 * `contact_message` — general enquiries. They stayed separate tables because the
 * appeal shape predates the inbox (selfie upload, reason, explanation), and are
 * merged at the API with a `type` discriminator. Every write therefore needs the
 * type as well as the id, which is why the row's identity here is the pair.
 */
export const SUPPORT_TYPES = ["appeal", "contact"] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export const SUPPORT_STATUSES = [
  "pending",
  "under_review",
  "resolved",
  "approved",
  "rejected",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Filters the list endpoint accepts. "unread" is a view, not a status. */
export const SUPPORT_FILTERS = ["all", "unread", ...SUPPORT_STATUSES] as const;

const replySchema = z.object({
  message: z.string(),
  sentAt: z.string(),
  adminEmail: z.string().catch(""),
});
export type SupportReply = z.output<typeof replySchema>;

export const supportMessageSchema = z.object({
  id: z.string(),
  type: z.enum(SUPPORT_TYPES),
  name: z.string().catch(""),
  email: z.string().catch(""),
  subject: nullableString,
  message: z.string().catch(""),
  category: nullableString,
  fileUrl: nullableString,
  status: z.string().catch("pending"),
  readByAdmin: z.boolean().catch(false),
  replies: z.array(replySchema).catch([]),
  submittedAt: z.string(),
});
export type SupportMessage = z.output<typeof supportMessageSchema>;

/**
 * A stable key for one thread across both tables.
 *
 * Ids are unique within their own table and nothing guarantees they are unique
 * across the two, so a bare id is not a usable React key or URL parameter here.
 * The API's notification rows use the same "appeal:<id>" / "contact:<id>" shape,
 * so a deep link from the bell and a row selected in the table produce the same
 * string.
 */
export function supportKey(message: Pick<SupportMessage, "type" | "id">): string {
  return `${message.type}:${message.id}`;
}

/** The inverse. Returns null for anything that is not a key this build wrote. */
export function parseSupportKey(key: string | null): { type: SupportType; id: string } | null {
  if (!key) return null;
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const type = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (!id || !(SUPPORT_TYPES as readonly string[]).includes(type)) return null;
  return { type: type as SupportType, id };
}

const inboxSchema = z
  .object({
    data: z.array(supportMessageSchema).catch([]),
    pagination: z.object({ total: z.number(), page: z.number(), limit: z.number() }).optional(),
    summary: z
      .object({
        totalAppeals: z.number().catch(0),
        totalContact: z.number().catch(0),
        unread: z.number().catch(0),
      })
      .optional(),
  })
  .transform((v) => ({
    rows: v.data,
    total: v.pagination?.total ?? v.data.length,
    summary: v.summary ?? {
      totalAppeals: v.data.filter((m) => m.type === "appeal").length,
      totalContact: v.data.filter((m) => m.type === "contact").length,
      unread: v.data.filter((m) => !m.readByAdmin).length,
    },
  }));

export interface SupportQuery {
  page: number;
  pageSize: number;
  status?: (typeof SUPPORT_FILTERS)[number] | null;
  type?: SupportType | "all" | null;
}

export function fetchSupportMessages(query: SupportQuery, signal?: AbortSignal) {
  return adminApi.get(support, {
    query: {
      page: query.page,
      limit: query.pageSize,
      status: query.status ?? "all",
      type: query.type ?? "all",
    },
    schema: inboxSchema,
    signal,
  });
}

/**
 * One thread, in full.
 *
 * The list endpoint already returns the body and the replies, so this exists for
 * the fields it does not: an appeal's phone number, file metadata and
 * `userId` — the last of which is what links a message to a customer record.
 * Loosely typed because the two tables genuinely differ in shape and the detail
 * panel renders what is present rather than a fixed set.
 */
const detailSchema = z
  .object({
    data: z.looseObject({
      id: z.string(),
      name: z.string().catch(""),
      email: z.string().catch(""),
      status: z.string().catch("pending"),
      replies: z.array(replySchema).catch([]),
      userId: nullableString,
      number: nullableString,
      fileUrl: nullableString,
      fileName: nullableString,
      fileType: nullableString,
      subject: nullableString,
      category: nullableString,
      message: nullableString,
      reasonForAppeal: nullableString,
      explanation: nullableString,
      readByAdmin: z.boolean().catch(false),
      submittedAt: timestamp,
    }),
  })
  .transform((v) => v.data);
export type SupportMessageDetail = z.output<typeof detailSchema>;

export function fetchSupportMessage(type: SupportType, id: string, signal?: AbortSignal) {
  return adminApi.get(`${support}/${type}/${encodeURIComponent(id)}`, {
    schema: detailSchema,
    signal,
  });
}

/**
 * Send a reply.
 *
 * This goes out as EMAIL to the address the person wrote in from — it is not an
 * in-app message. That is deliberate on the API side and worth knowing in the
 * UI: an appeal usually comes from somebody who cannot sign in, which is exactly
 * why they wrote in, so an in-app reply would never be read.
 */
export function replyToSupportMessage(type: SupportType, id: string, message: string) {
  return adminApi.post(`${support}/${type}/${encodeURIComponent(id)}/reply`, { message });
}

export function setSupportStatus(type: SupportType, id: string, status: string) {
  return adminApi.patch(`${support}/${type}/${encodeURIComponent(id)}/status`, { status });
}

export function markSupportMessageRead(type: SupportType, id: string) {
  return adminApi.patch(`${support}/${type}/${encodeURIComponent(id)}/read`);
}

/* ─── Live chat ──────────────────────────────────────────────────────────── */

export const chatRoomSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string(),
  userName: z.string().catch("Unknown customer"),
  userEmail: nullableString,
  lastMessage: nullableString,
  lastMessageAt: timestamp,
  lastMessageFromAdmin: z.boolean().catch(false),
  unreadCount: z.number().catch(0),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ChatRoom = z.output<typeof chatRoomSchema>;

const roomsSchema = z
  .object({
    rooms: z.array(chatRoomSchema).catch([]),
    total: z.number().catch(0),
  })
  .transform((v) => ({ rows: v.rooms, total: v.total }));

export function fetchChatRooms(query: { page: number; pageSize: number }, signal?: AbortSignal) {
  return adminApi.get(`${chat}/admin/rooms`, {
    // The API caps `limit` at 50.
    query: { page: query.page, limit: Math.min(query.pageSize, 50) },
    schema: roomsSchema,
    signal,
  });
}

export const chatMessageSchema = z.object({
  id: z.string(),
  roomId: nullableString,
  senderId: z.string().catch(""),
  message: z.string().catch(""),
  read: z.boolean().nullish().catch(null),
  createdAt: z.string(),
});
export type ChatMessage = z.output<typeof chatMessageSchema>;

const conversationSchema = z.object({
  messages: z.array(chatMessageSchema).catch([]),
  user: z
    .object({
      id: z.string(),
      firstName: z.string().catch(""),
      lastName: z.string().catch(""),
      email: z.string().catch(""),
      dateOfBirth: nullableString,
    })
    .nullish()
    .catch(null),
});
export type ChatConversation = z.output<typeof conversationSchema>;

/**
 * Opening a room also marks the customer's messages read, server-side.
 *
 * A side effect on a GET, which is not ideal, but it is the API's behaviour and
 * it is the correct outcome: the admin is looking at the messages right now. The
 * console must therefore refresh the room list after reading a conversation, or
 * the unread badges it is showing are stale by its own action.
 */
export function fetchChatConversation(roomId: string, signal?: AbortSignal) {
  return adminApi.get(`${chat}/admin/room/${encodeURIComponent(roomId)}`, {
    schema: conversationSchema,
    signal,
  });
}

export function replyToChat(roomId: string, message: string) {
  return adminApi.post(`${chat}/admin/reply`, { roomId, message });
}

/** Open (or create) the support room for a customer who has not written in yet. */
export function startChatWithUser(userId: string) {
  return adminApi.post(`${chat}/admin/start-chat/${encodeURIComponent(userId)}`, undefined, {
    schema: z.object({ roomId: z.string() }).transform((v) => v.roomId),
  });
}

/** True when the message came from the admin side of the room. */
export function isFromAdmin(message: ChatMessage, customerUserId: string | null): boolean {
  if (!customerUserId) return false;
  return message.senderId !== customerUserId;
}

/* ─── Broadcasts & Outreach ─────────────────────────────────────────────────── */

export type DeliveryMethod = "EMAIL" | "PUSH" | "EMAIL_AND_PUSH";

export interface AudienceOption {
  value: string;
  label: string;
  hint: string;
}

export const AUDIENCE_GROUPS: { group: string; options: AudienceOption[] }[] = [
  {
    group: "Everyone",
    options: [
      { value: "ALL", label: "All users", hint: "Every registered account." },
      {
        value: "SPECIFIC",
        label: "Specific user(s)",
        hint: "Only the email addresses you list.",
      },
    ],
  },
  {
    group: "Account status",
    options: [
      {
        value: "ACTIVE",
        label: "Email confirmed",
        hint: "Accounts that have confirmed their email address.",
      },
      {
        value: "INACTIVE",
        label: "Email not confirmed",
        hint: "Accounts that never confirmed their email address.",
      },
      {
        value: "NEWLY_REGISTERED",
        label: "Newly registered",
        hint: "Signed up within the last 7 days.",
      },
    ],
  },
  {
    group: "KYC",
    options: [
      {
        value: "KYC_COMPLETED",
        label: "KYC completed",
        hint: "Reached KYC level 1 or verified BVN / ID.",
      },
      { value: "KYC_NOT_COMPLETED", label: "KYC not completed", hint: "Still on KYC level 0." },
    ],
  },
  {
    group: "Referrals",
    options: [
      {
        value: "REFERRAL_USERS",
        label: "Referrers (Invited others)",
        hint: "Users who have referred at least one user.",
      },
      {
        value: "REFERRED_USERS",
        label: "Referred users (Invited by others)",
        hint: "Users who registered using a referral link or code.",
      },
    ],
  },
  {
    group: "Activity & Trading",
    options: [
      {
        value: "WALLET_NOT_FUNDED",
        label: "Wallet never funded",
        hint: "No completed deposit or wallet funding, ever.",
      },
      {
        value: "FIRST_TRANSACTION_COMPLETED",
        label: "First transaction done",
        hint: "Exactly one completed transaction so far.",
      },
      {
        value: "NO_TRANSACTION_7_DAYS",
        label: "No activity in 7 days",
        hint: "No completed transaction in 7 days.",
      },
      {
        value: "NO_TRANSACTION_30_DAYS",
        label: "No activity in 30 days",
        hint: "No completed transaction in 30 days.",
      },
      {
        value: "CRYPTO_BUYERS",
        label: "Crypto buyers",
        hint: "Completed at least one crypto buy trade.",
      },
      {
        value: "CRYPTO_SELLERS",
        label: "Crypto sellers",
        hint: "Completed at least one crypto sell trade.",
      },
      {
        value: "BILL_PAYMENT_USERS",
        label: "Bill payment users",
        hint: "Paid for airtime, data, electricity or cable.",
      },
      {
        value: "HIGH_VOLUME_TRADERS",
        label: "High-volume traders",
        hint: "₦1m+ naira volume in the last 30 days.",
      },
      {
        value: "VIP_USERS",
        label: "VIP (top spenders)",
        hint: "₦5m+ naira volume in the last 30 days.",
      },
    ],
  },
];

export const broadcastRecordSchema = z.object({
  id: z.string(),
  title: z.string().catch(""),
  content: z.string().catch(""),
  audience: z.string().catch("ALL"),
  specificEmails: z.array(z.string()).nullish().catch(null),
  deliveryMethod: z.string().catch("EMAIL_AND_PUSH"),
  status: z.string().catch("sent"),
  sentAt: nullableString,
  recipientCount: z.number().nullish().catch(null),
  successCount: z.number().nullish().catch(null),
  failedCount: z.number().nullish().catch(null),
  createdAt: z.string(),
});
export type BroadcastRecord = z.output<typeof broadcastRecordSchema>;

export const broadcastHistorySchema = z.object({
  items: z.array(broadcastRecordSchema).catch([]),
  page: z.number().catch(1),
  limit: z.number().catch(10),
  total: z.number().catch(0),
  totalPages: z.number().catch(1),
});
export type BroadcastHistoryResponse = z.output<typeof broadcastHistorySchema>;

export function fetchBroadcastRecipientCount(audience: string, signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.core}/broadcast-recipient-count`, {
    query: { audience },
    schema: z.object({ count: z.number().catch(0) }).transform((v) => v.count),
    signal,
  });
}

export function sendBroadcastMessage(body: {
  recipientType: string;
  subject: string;
  message: string;
  deliveryMethod: DeliveryMethod;
  specificEmails?: string[];
}) {
  return adminApi.post(`${adminPaths.core}/broadcast-message`, body);
}

export function fetchBroadcastHistory(page: number, limit: number, signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.core}/broadcast-history`, {
    query: { page, limit },
    schema: broadcastHistorySchema,
    signal,
  });
}

export function deleteBroadcastHistory(id: string) {
  return adminApi.delete(`${adminPaths.core}/broadcast-history/${encodeURIComponent(id)}`);
}

export function fetchAutomatedPushStats(signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.core}/automated-pushes/stats`, {
    schema: z.object({ data: z.unknown() }).transform((v) => v.data),
    signal,
  });
}

export function triggerAutomatedPushSweep(triggerId?: string) {
  return adminApi.post(`${adminPaths.core}/automated-pushes/trigger`, { triggerId });
}
