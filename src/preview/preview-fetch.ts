/**
 * PREVIEW-ONLY stand-in for the FlurryPay API. Plugged into the admin API
 * client when NEXT_PUBLIC_PREVIEW_MODE is on: requests never leave the
 * browser, and changes live in memory until the page is reloaded.
 */
import { adminPaths } from "@/lib/api/admin-paths";

import {
  admins,
  auditLogs,
  chatMessages,
  chatRooms,
  complianceAlerts,
  complianceReports,
  cryptoReserves,
  earnings,
  fullName,
  fundHolds,
  kycEntity,
  kycProfiles,
  notifications,
  payoutProviders,
  PREVIEW_ADMIN_ID,
  PREVIEW_NOW,
  rates,
  reversalCandidates,
  riskCases,
  roles,
  strandedTransfers,
  supportMessages,
  transactions,
  treasuryMovements,
  users,
} from "./data";

type Json = Record<string, unknown>;
interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Json;
}
type Handler = (req: Req, params: string[]) => Response | Promise<Response>;

const DAY = 86_400_000;

/** A request-body field as text ("" when absent or not a string). */
const text = (value: unknown): string => (typeof value === "string" ? value : "");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": "preview" },
  });
}
const ok = (message = "Saved (preview only: nothing leaves this browser).") =>
  json({ success: true, message });
const notFound = (what = "Not found") => json({ success: false, message: what }, 404);

function page<T>(rows: T[], q: URLSearchParams, defaultLimit = 50) {
  const pageNo = Math.max(1, Number(q.get("page") ?? 1) || 1);
  const limit = Math.max(1, Number(q.get("limit") ?? defaultLimit) || defaultLimit);
  return {
    rows: rows.slice((pageNo - 1) * limit, pageNo * limit),
    total: rows.length,
    page: pageNo,
    limit,
  };
}

const inRange = (iso: string | null, from: string | null, to: string | null) =>
  !!iso &&
  (!from || iso >= new Date(from).toISOString()) &&
  (!to || iso <= new Date(to).toISOString());

const contains = (term: string, ...fields: (string | null | undefined)[]) =>
  fields.some((f) => f?.toLowerCase().includes(term));

function audit(
  action: string,
  metadata: Json,
  target?: { type: string; id: string },
  reason?: string,
) {
  auditLogs.unshift({
    id: crypto.randomUUID(),
    adminId: PREVIEW_ADMIN_ID,
    adminEmail: "preview.admin@example.com",
    action,
    metadata,
    ipAddress: "127.0.0.1",
    userAgent: navigator.userAgent,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    reason: reason ?? null,
    requestId: `req_preview_${auditLogs.length}`,
    before: null,
    after: null,
    createdAt: new Date().toISOString(),
  });
}

/* ─── Users ──────────────────────────────────────────────────────────────── */

function userStates(u: (typeof users)[number]): string[] {
  const now = new Date().toISOString();
  const states: string[] = [];
  if (u.isBlocked) states.push("blocked");
  if (u.isSuspended) states.push("suspended");
  if (u.outboundRestricted) states.push("frozen");
  if ((u.loginLockedUntil ?? "") > now || (u.pinLockedUntil ?? "") > now) states.push("locked");
  if (!u.isConfirmed) states.push("unconfirmed");
  return states.length ? states : ["active"];
}

function withStats(u: (typeof users)[number]) {
  const done = transactions.filter((t) => t.userId === u.id && t.status === "COMPLETED");
  return { ...u, transactionCount: done.length, lastTransactionDate: done[0]?.createdAt ?? null };
}

function filterUsers(q: URLSearchParams | Json) {
  const get = (k: string) =>
    (q instanceof URLSearchParams ? q.get(k) : (q[k] as string | undefined)) ?? null;
  const term = get("search")?.toLowerCase();
  const status = get("status");
  const level = get("level");
  return users.filter(
    (u) =>
      (!term ||
        contains(
          term,
          u.email,
          u.firstName,
          u.lastName,
          fullName(u),
          u.userName,
          u.phoneNumber,
          u.id,
        )) &&
      (!status || userStates(u).includes(status)) &&
      (!level || String(u.level) === level),
  );
}

const USER_SORT: Record<string, (u: (typeof users)[number]) => string | number> = {
  createdAt: (u) => u.createdAt,
  name: (u) => u.firstName.toLowerCase(),
  walletBalance: (u) => Number(u.walletBalance),
  level: (u) => u.level,
  lastLogin: (u) => u.lastLogin ?? "",
};

function setUser(
  id: string,
  patch: Partial<(typeof users)[number]>,
  action: string,
  reason?: string,
) {
  const u = users.find((x) => x.id === id);
  if (!u) return notFound("User not found");
  Object.assign(u, patch);
  audit(action, { targetUserId: id, reason }, { type: "user", id }, reason);
  return ok();
}

/* ─── Transactions ───────────────────────────────────────────────────────── */

function filterTransactions(q: URLSearchParams | Json) {
  const get = (k: string) =>
    (q instanceof URLSearchParams ? q.get(k) : (q[k] as string | undefined)) ?? null;
  const term = get("search")?.toLowerCase();
  const from = get("startDate") ?? get("from");
  const to = get("endDate") ?? get("to");
  return transactions.filter(
    (t) =>
      (!get("type") || t.transactionType === get("type")) &&
      (!get("status") || t.status === get("status")) &&
      (!get("currencyType") || t.currencyType === get("currencyType")) &&
      (!get("userId") || t.userId === get("userId")) &&
      (!from && !to ? true : inRange(t.createdAt, from, to)) &&
      // "Flagged" is an OPEN flag — raised and not yet cleared. A cleared flag
      // stays on the row as history, so without the second condition the review
      // queue keeps returning finished work.
      (get("flagged") === "FLAGGED"
        ? Boolean(t.flaggedAt) && !t.flagClearedAt
        : get("flagged") === "CLEARED"
          ? Boolean(t.flagClearedAt)
          : true) &&
      (!get("flagSeverity") || t.flagSeverity === get("flagSeverity")) &&
      (!term || contains(term, t.reference, t.externalId, t.user.email, t.id, t.transactionHash)),
  );
}

/** Open flags only, for the summary endpoint and the filter's counts. */
const openFlags = () => transactions.filter((t) => t.flaggedAt && !t.flagClearedAt);

/* ─── Reports ────────────────────────────────────────────────────────────── */

const watDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(iso));

function transactionsReport(q: URLSearchParams) {
  const from = q.get("from");
  const to = q.get("to");
  const rows = transactions.filter((t) => inRange(t.createdAt, from, to));
  const groups = new Map<
    string,
    {
      type: string;
      status: string;
      currency: string;
      count: number;
      totalAmount: number;
      totalFee: number;
    }
  >();
  const days = new Map<string, { day: string; count: number; completed: number; failed: number }>();
  for (const t of rows) {
    const key = `${t.transactionType}|${t.status}|${t.currency}`;
    const g = groups.get(key) ?? {
      type: t.transactionType,
      status: t.status,
      currency: t.currency,
      count: 0,
      totalAmount: 0,
      totalFee: 0,
    };
    g.count++;
    g.totalAmount += Number(t.amount);
    g.totalFee += Number(t.fee);
    groups.set(key, g);
    const day = watDay(t.createdAt);
    const d = days.get(day) ?? { day, count: 0, completed: 0, failed: 0 };
    d.count++;
    if (t.status === "COMPLETED") d.completed++;
    if (t.status === "FAILED") d.failed++;
    days.set(day, d);
  }
  const crypto = (c: string) => c !== "NGN";
  return {
    from,
    to,
    timeZone: "Africa/Lagos",
    breakdown: [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .map((g) => ({
        ...g,
        totalAmount: g.totalAmount.toFixed(crypto(g.currency) ? 8 : 2),
        totalFee: g.totalFee.toFixed(crypto(g.currency) ? 8 : 2),
      })),
    daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

function usersReport(q: URLSearchParams) {
  const from = q.get("from");
  const to = q.get("to");
  const signups = new Map<string, number>();
  for (const u of users) {
    if (!inRange(u.createdAt, from, to)) continue;
    const day = watDay(u.createdAt);
    signups.set(day, (signups.get(day) ?? 0) + 1);
  }
  const levels = new Map<number, number>();
  for (const u of users) levels.set(u.level, (levels.get(u.level) ?? 0) + 1);
  const count = (state: string) => users.filter((u) => userStates(u).includes(state)).length;
  return {
    from,
    to,
    timeZone: "Africa/Lagos",
    signups: [...signups]
      .map(([day, c]) => ({ day, count: c }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    levels: [...levels]
      .map(([level, c]) => ({ level, count: c }))
      .sort((a, b) => a.level - b.level),
    totals: {
      total: users.length,
      confirmed: users.filter((u) => u.isConfirmed).length,
      blocked: count("blocked"),
      suspended: count("suspended"),
      frozen: count("frozen"),
      locked: count("locked"),
    },
  };
}

/* ─── Exports ────────────────────────────────────────────────────────────── */

const UTF8_BOM = "\uFEFF";

function csvCell(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function exportFile(body: Json): Response {
  const filters = (body.filters as Json | undefined) ?? {};
  let header: string[];
  let rows: (string | number | boolean | null | undefined)[][];
  if (body.dataset === "users") {
    header = ["User ID", "Name", "Email", "Status", "KYC level", "Naira balance", "Joined (UTC)"];
    rows = filterUsers(filters).map((u) => [
      u.id,
      fullName(u),
      u.email,
      userStates(u).join("; "),
      u.level,
      u.walletBalance,
      u.createdAt,
    ]);
  } else if (body.dataset === "audit") {
    header = ["When (UTC)", "Administrator", "Action", "Target type", "Target ID", "Reason"];
    rows = auditLogs.map((l) => [
      l.createdAt,
      l.adminEmail,
      l.action,
      l.targetType,
      l.targetId,
      l.reason,
    ]);
  } else {
    header = [
      "Created (UTC)",
      "Reference",
      "Type",
      "Status",
      "Amount",
      "Currency",
      "Customer email",
    ];
    rows = filterTransactions(filters).map((t) => [
      t.createdAt,
      t.reference,
      t.transactionType,
      t.status,
      t.amount,
      t.currency,
      t.user.email,
    ]);
  }
  audit(
    "DATA_EXPORTED",
    { dataset: body.dataset, format: body.format, rowCount: rows.length, filters },
    { type: "dataset", id: String(body.dataset) },
  );
  const csv = UTF8_BOM + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  // Preview always returns CSV; the real API also produces XLSX.
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "X-Row-Count": String(rows.length) },
  });
}

/* ─── Routes ─────────────────────────────────────────────────────────────── */

const core = adminPaths.core;
const routes: [string, RegExp, Handler][] = [];
function route(method: string, pattern: string, handler: Handler) {
  const regex = new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, "([^/]+)")}$`);
  routes.push([method, regex, handler]);
}

// Session and account
route("GET", `${core}/details`, () =>
  json({
    adminDetails: {
      ...admins[0],
      pinIsSet: true,
      recoveryCodesRemaining: 8,
    },
  }),
);
route("POST", `${core}/logout`, () => ok());
route("POST", `${core}/session/refresh`, () => json({ token: "preview", maxAgeEndsAt: null }));
route("POST", `${core}/security/recovery-codes`, () =>
  json({ codes: Array.from({ length: 10 }, (_, i) => `prev${i}-demo${i}`) }),
);
route("POST", `${core}/security/setup-2fa`, () =>
  json({
    secret: "PREVIEWONLYSECRET",
    otpauth: "otpauth://totp/FlurryPay%20Preview?secret=PREVIEWONLYSECRET",
  }),
);

// Notifications
route("GET", adminPaths.notifications, (req) => {
  const unreadOnly = req.query.get("unread") === "true";
  const visible = unreadOnly ? notifications.filter((n) => !n.read) : notifications;
  // Newest first and paged, matching the API — the bell relies on the server for
  // both now rather than sorting and slicing in the browser.
  const sorted = [...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { rows, total, page: pageNo, limit } = page(sorted, req.query);
  return json({
    notifications: rows,
    unread: notifications.filter((n) => !n.read).length,
    pagination: { page: pageNo, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});
route("PATCH", `${adminPaths.notifications}/read/:id`, (_r, [id]) => {
  const n = notifications.find((x) => x.id === id);
  if (!n) return notFound("Notification not found");
  n.read = true;
  return ok();
});
route("PATCH", `${adminPaths.notifications}/read-all`, (req) => {
  const ids = Array.isArray(req.body.notificationIds)
    ? (req.body.notificationIds as string[])
    : null;
  let affected = 0;
  for (const n of notifications) {
    if (n.read) continue;
    if (ids && !ids.includes(n.id)) continue;
    n.read = true;
    affected++;
  }
  return json({ success: true, message: `${affected} marked as read.`, affected });
});

/* ─── Support: the merged inbox ──────────────────────────────────────────── */

const support = adminPaths.support;

/**
 * Both tables are merged by the API, so a row is found by the (type, id) pair.
 *
 * Takes `string | undefined` because a route's captured segments are typed that
 * way; an absent segment simply matches nothing, which is the correct answer.
 */
const findSupport = (type: string | undefined, id: string | undefined) =>
  type && id ? supportMessages.find((m) => m.type === type && m.id === id) : undefined;

route("GET", support, (req) => {
  const status = req.query.get("status") ?? "all";
  const kind = req.query.get("type") ?? "all";

  let rows = [...supportMessages].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  if (kind !== "all") rows = rows.filter((m) => m.type === kind);
  if (status === "unread") rows = rows.filter((m) => !m.readByAdmin);
  else if (status !== "all") rows = rows.filter((m) => m.status === status);

  const paged = page(rows, req.query, 25);
  return json({
    data: paged.rows,
    pagination: {
      page: paged.page,
      limit: paged.limit,
      total: paged.total,
      totalPages: Math.max(1, Math.ceil(paged.total / paged.limit)),
    },
    summary: {
      totalAppeals: supportMessages.filter((m) => m.type === "appeal").length,
      totalContact: supportMessages.filter((m) => m.type === "contact").length,
      unread: supportMessages.filter((m) => !m.readByAdmin).length,
    },
  });
});

route("GET", `${support}/:type/:id`, (_r, [type, id]) => {
  const found = findSupport(type, id);
  return found ? json({ data: found }) : notFound("Message not found");
});

route("POST", `${support}/:type/:id/reply`, (req, [type, id]) => {
  const found = findSupport(type, id);
  if (!found) return notFound("Message not found");
  const message = text(req.body.message).trim();
  if (!message) return json({ message: "Reply message is required." }, 400);
  found.replies.push({
    message,
    sentAt: new Date().toISOString(),
    adminEmail: "preview.admin@example.com",
  });
  found.readByAdmin = true;
  audit("SUPPORT_MESSAGE_REPLIED", { type, id }, { type: "supportMessage", id: found.id });
  return json({ message: "Reply sent (preview only: no email leaves this browser).", data: found });
});

route("PATCH", `${support}/:type/:id/status`, (req, [type, id]) => {
  const found = findSupport(type, id);
  if (!found) return notFound("Message not found");
  const status = text(req.body.status);
  if (!status) return json({ message: "Status is required." }, 400);
  found.status = status;
  audit(
    "SUPPORT_MESSAGE_STATUS_CHANGED",
    { type, id, status },
    { type: "supportMessage", id: found.id },
  );
  return json({ data: found });
});

route("PATCH", `${support}/:type/:id/read`, (_r, [type, id]) => {
  const found = findSupport(type, id);
  if (!found) return notFound("Message not found");
  found.readByAdmin = true;
  return ok();
});

/* ─── Support: live chat ─────────────────────────────────────────────────── */

const chat = adminPaths.chat;

route("GET", `${chat}/admin/rooms`, (req) => {
  const sorted = [...chatRooms].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  const paged = page(sorted, req.query, 20);
  return json({
    rooms: paged.rows,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: Math.max(1, Math.ceil(paged.total / paged.limit)),
  });
});

route("GET", `${chat}/admin/room/:roomId`, (_r, [roomId]) => {
  const room = chatRooms.find((r) => r.roomId === roomId);
  if (!room) return notFound("Chat room not found");
  // The API marks the customer's messages read as a side effect of this read, so
  // the preview does too — otherwise the unread badges never clear here and the
  // console's refresh-after-read looks like a bug.
  room.unreadCount = 0;
  const user = users.find((u) => u.id === room.userId);
  return json({
    messages: (roomId && chatMessages[roomId]) || [],
    user: user
      ? { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email }
      : null,
  });
});

route("POST", `${chat}/admin/reply`, (req) => {
  const roomId = text(req.body.roomId);
  const message = text(req.body.message).trim();
  const room = chatRooms.find((r) => r.roomId === roomId);
  if (!room) return notFound("Chat room not found");
  if (!message) return json({ message: "roomId and message are required" }, 400);
  const sent = {
    id: crypto.randomUUID(),
    roomId,
    senderId: PREVIEW_ADMIN_ID,
    message,
    read: true,
    createdAt: new Date().toISOString(),
  };
  (chatMessages[roomId] ??= []).push(sent);
  room.lastMessage = message;
  room.lastMessageAt = sent.createdAt;
  room.lastMessageFromAdmin = true;
  room.unreadCount = 0;
  return json({ message: "Reply sent", chat: sent }, 201);
});

// Search
route("GET", `${core}/search`, (req) => {
  const q = (req.query.get("q") ?? "").toLowerCase();
  return json({
    users: filterUsers(new URLSearchParams({ search: q })).slice(0, 6),
    walletAddresses: [],
    transactions:
      q.length >= 4
        ? transactions.filter((t) => contains(q, t.reference, t.externalId)).slice(0, 6)
        : [],
    admins: admins.filter((a) => contains(q, a.email, a.firstName, a.lastName)).slice(0, 5),
  });
});

// Users
route("GET", `${core}/users/search`, (req) => {
  const sortKey = USER_SORT[req.query.get("sortBy") ?? "createdAt"] ?? USER_SORT.createdAt;
  const dir = req.query.get("sortOrder")?.toLowerCase() === "asc" ? 1 : -1;
  const sorted = [...filterUsers(req.query)].sort((a, b) => {
    const x = sortKey?.(a) ?? 0;
    const y = sortKey?.(b) ?? 0;
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const p = page(sorted, req.query);
  return json({
    data: p.rows.map(withStats),
    pagination: {
      total: p.total,
      page: p.page,
      limit: p.limit,
      totalPages: Math.ceil(p.total / p.limit),
    },
  });
});
route("GET", `${core}/get-user/:id`, (_r, [id]) => {
  const u = users.find((x) => x.id === id);
  if (!u) return notFound("User not found");
  return json({
    ...withStats(u),
    country: "NG",
    referralCode: u.userName.toUpperCase(),
    hasActivated2FA: u.level >= 2,
    hasVerifiedLiveness: u.level >= 3,
    identityVerified: u.level >= 1,
    lastLoginIp: "102.89.34.12",
    loginCount: 42,
    updatedAt: u.lastLogin ?? u.createdAt,
    bankDetails: [
      {
        bankName: "Nomba MFB",
        accountNumber: "81" + u.phoneNumber.slice(-8),
        accountName: fullName(u),
      },
    ],
    coinBalances: [
      { name: "Tether", ticker: "USDT", cryptoBalance: "412.550000", nairaBalance: "639452.50" },
      { name: "Bitcoin", ticker: "BTC", cryptoBalance: "0.00231000", nairaBalance: "346500.00" },
    ],
  });
});
route("GET", `${core}/user-wallet-addresses/:id`, () =>
  json({
    wallets: [
      {
        coinName: "Tether",
        coinTicker: "USDT",
        coinBalance: {
          cryptoBalance: "412.550000",
          nairaBalance: "639452.50",
          lastUpdated: new Date().toISOString(),
        },
        networks: [
          {
            id: "w1",
            address: "TXq7preview9a3c1f0d2b8e4a6c5d7f9e1b3a5",
            network: "tron",
            withdrawsEnabled: true,
          },
        ],
      },
      {
        coinName: "Bitcoin",
        coinTicker: "BTC",
        coinBalance: {
          cryptoBalance: "0.00231000",
          nairaBalance: "346500.00",
          lastUpdated: new Date().toISOString(),
        },
        networks: [
          {
            id: "w2",
            address: "bc1qpreview4k7x9m2n8p0q3r5s7t9v1w3x5y7z9a",
            network: "bitcoin",
            withdrawsEnabled: true,
          },
        ],
      },
    ],
  }),
);
route("GET", `${core}/user-activity/:id`, (req) => {
  const logs = Array.from({ length: 12 }, (_, i) => ({
    id: `act-${i}`,
    action: ["LOGIN", "PIN_CHANGED", "WITHDRAWAL_REQUESTED", "LOGIN", "DEVICE_VERIFIED"][i % 5],
    ipAddress: "102.89.34.12",
    deviceInfo: "iPhone 15 · FlurryPay 3.4.1",
    location: "Lagos, NG",
    metadata: {},
    createdAt: new Date(PREVIEW_NOW - i * 0.7 * DAY).toISOString(),
  }));
  const limit = Number(req.query.get("limit") ?? 20);
  const offset = Number(req.query.get("offset") ?? 0);
  return json({ logs: logs.slice(offset, offset + limit), total: logs.length });
});
/* ─── Naira wallet: ledger and manual adjustments ────────────────────────── */

/**
 * A synthetic ledger, built backwards from the current balance.
 *
 * Backwards on purpose: `balanceBefore`/`balanceAfter` are the whole point of the
 * ledger, and the only way for the newest entry's `balanceAfter` to actually
 * equal the balance shown above it is to start from that number and work down.
 * Built forwards from an invented opening balance, the preview would show a
 * wallet that does not reconcile — which is the alarm state, not the normal one.
 */
const previewLedger = new Map<string, Json[]>();

function walletLedgerFor(userId: string): Json[] {
  const existing = previewLedger.get(userId);
  if (existing) return existing;

  const user = users.find((u) => u.id === userId);
  let running = Number(user?.walletBalance ?? 0);
  const movements = transactions
    .filter((t) => t.userId === userId && t.currencyType === "FIAT" && t.status === "COMPLETED")
    .slice(0, 20);

  const entries: Json[] = movements.map((t, index) => {
    const credit = t.transactionType === "FIAT_DEPOSIT" || t.transactionType === "WALLET_FUNDING";
    const amount = Number(t.amount);
    const after = running;
    const before = credit ? after - amount : after + amount;
    running = before;
    return {
      id: `led-${userId}-${index}`,
      direction: credit ? "CREDIT" : "DEBIT",
      amountNaira: amount.toFixed(2),
      balanceBefore: before.toFixed(2),
      balanceAfter: after.toFixed(2),
      source: credit ? "DEPOSIT_WEBHOOK" : t.transactionType,
      reference: t.reference,
      narration: credit ? "Bank transfer" : null,
      createdAt: t.createdAt,
    };
  });

  previewLedger.set(userId, entries);
  return entries;
}

route("GET", `${adminPaths.ledger}/statement/:userId`, (req, [userId]) => {
  const limit = Math.min(Number(req.query.get("limit") ?? 200) || 200, 1000);
  const entries = walletLedgerFor(userId ?? "").slice(0, limit);
  return json({
    success: true,
    data: { entries, gaps: [], reconciles: true },
  });
});

/**
 * Manual credit and debit.
 *
 * The preview enforces the same shape the API does — the four credentials are
 * accepted without being checked (there is nothing here to check them against),
 * but the amount rules, the insufficient-balance refusal and the
 * `recordTransaction`/`notifyCustomer` reporting all behave as they will in
 * production, which is what makes the dialog worth previewing at all.
 */
function adjustWallet(direction: "credit" | "debit", body: Json): Response {
  const identifier = text(body.identifier).trim().toLowerCase();
  const user = users.find(
    (u) =>
      u.id === text(body.identifier).trim() ||
      u.email.toLowerCase() === identifier ||
      u.userName.toLowerCase() === identifier,
  );
  if (!user) return notFound(`No user found for "${text(body.identifier)}".`);

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ message: "Amount must be a positive number." }, 400);
  }
  if (amount >= 100_000_000) {
    return json(
      { message: "Amount exceeds the maximum a single credit can record (₦99,999,999.99)." },
      400,
    );
  }

  const balanceBefore = Number(user.walletBalance);
  if (direction === "debit" && balanceBefore < amount) {
    return json(
      {
        message:
          `Insufficient balance. The account holds ₦${balanceBefore.toLocaleString()}, ` +
          `which will not cover a ₦${amount.toLocaleString()} debit.`,
      },
      400,
    );
  }

  const balanceAfter =
    Math.round((direction === "credit" ? balanceBefore + amount : balanceBefore - amount) * 100) /
    100;
  user.walletBalance = balanceAfter.toFixed(2);

  const statementRowWritten = body.recordTransaction !== false;
  const customerNotified = body.notifyCustomer !== false;
  const reference = `FLP-${direction === "debit" ? "DEBIT-" : ""}${crypto.randomUUID()}`;
  const narration = text(body.narration).trim();

  // The ledger entry is written whatever the options say — that is the whole
  // point of the distinction the dialog draws.
  walletLedgerFor(user.id).unshift({
    id: `led-${crypto.randomUUID()}`,
    direction: direction === "credit" ? "CREDIT" : "DEBIT",
    amountNaira: amount.toFixed(2),
    balanceBefore: balanceBefore.toFixed(2),
    balanceAfter: balanceAfter.toFixed(2),
    source: direction === "credit" ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
    reference,
    narration: narration
      ? `Manual ${direction} by an admin: ${narration}`
      : `Manual ${direction} by an admin`,
    createdAt: new Date().toISOString(),
  });

  audit(
    direction === "credit" ? "USER_WALLET_MANUALLY_CREDITED" : "USER_WALLET_MANUALLY_DEBITED",
    {
      recipientId: user.id,
      recipientEmail: user.email,
      amount,
      reference,
      statementRowWritten,
      customerNotified,
    },
    { type: "user", id: user.id },
    narration || undefined,
  );

  return json({
    message:
      `₦${amount.toLocaleString()} ${direction === "credit" ? "credited to" : "debited from"} ` +
      `${fullName(user)}.` +
      (statementRowWritten ? "" : " No statement entry was created.") +
      (customerNotified ? "" : " The customer was not notified.") +
      " (Preview only: nothing leaves this browser.)",
    data: {
      recipient: { id: user.id, email: user.email, userName: user.userName },
      amount,
      reference,
      balanceBefore,
      balanceAfter,
      statementRowWritten,
      customerNotified,
    },
  });
}

route("POST", `${core}/credit-user`, (req) => adjustWallet("credit", req.body));
route("POST", `${core}/debit-user`, (req) => adjustWallet("debit", req.body));

route("GET", `${core}/user-statement-download/:id`, (_r, [id]) => {
  const rows = transactions.filter((t) => t.userId === id);
  const csv = [
    "Date,Reference,Type,Status,Amount,Currency",
    ...rows.map((t) =>
      [t.createdAt, t.reference, t.transactionType, t.status, t.amount, t.currency].join(","),
    ),
  ].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv" } });
});
for (const [action, patch, auditAction] of [
  [
    "blockUser",
    (b: Json) => ({ isBlocked: true, reasonForBlock: text(b.reason) }),
    "USER_ACCOUNT_BLOCKED",
  ],
  ["unblockUser", () => ({ isBlocked: false }), "USER_ACCOUNT_UNBLOCKED"],
  [
    "suspendUser",
    (b: Json) => ({
      isSuspended: true,
      suspensionReason: text(b.reason),
      suspendedAt: new Date().toISOString(),
    }),
    "USER_ACCOUNT_SUSPENDED",
  ],
  [
    "unsuspendUser",
    () => ({ isSuspended: false, suspensionReason: null }),
    "USER_ACCOUNT_UNSUSPENDED",
  ],
  [
    "freezeUser",
    (b: Json) => ({
      outboundRestricted: true,
      outboundRestrictedReason: text(b.reason),
      outboundRestrictedAt: new Date().toISOString(),
    }),
    "USER_ACCOUNT_FROZEN",
  ],
  [
    "unfreezeUser",
    () => ({ outboundRestricted: false, outboundRestrictedReason: null }),
    "USER_ACCOUNT_UNFROZEN",
  ],
] as const) {
  route("POST", `${adminPaths.users}/${action}/:id`, (req, [id]) =>
    setUser(
      id ?? "",
      patch(req.body),
      auditAction,
      (req.body.note ?? req.body.reason) as string | undefined,
    ),
  );
}

// Transactions
route("GET", `${adminPaths.transactions}/all`, (req) => {
  const sortBy = req.query.get("sortBy") ?? "createdAt";
  const dir = req.query.get("sortOrder") === "ASC" ? 1 : -1;
  const rows = [...filterTransactions(req.query)].sort((a, b) => {
    const field = (t: (typeof transactions)[number]) =>
      sortBy === "amount" ? Number(t.amount) : text(t[sortBy as keyof typeof t]);
    const x = field(a);
    const y = field(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const p = page(rows, req.query);
  return json({
    success: true,
    data: { transactions: p.rows, pagination: { total: p.total, page: p.page, limit: p.limit } },
  });
});

// Declared before "/:id/flag" shaped routes for the same reason the API declares
// it first: a literal path has to beat a parameter route that could swallow it.
route("GET", `${adminPaths.transactions}/flags/summary`, () => {
  const counts: Record<string, number> = { total: 0 };
  for (const tx of openFlags()) {
    const key = tx.flagSeverity ?? "UNSPECIFIED";
    counts[key] = (counts[key] ?? 0) + 1;
    counts.total = (counts.total ?? 0) + 1;
  }
  return json({ success: true, data: counts });
});

route("POST", `${adminPaths.transactions}/:id/flag`, (req, [id]) => {
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return notFound("Transaction not found");
  if (tx.flaggedAt && !tx.flagClearedAt) {
    return json(
      {
        success: false,
        code: "ALREADY_FLAGGED",
        message: "This transaction already has an open flag. Open it to see who raised it and why.",
      },
      409,
    );
  }
  const note = text(req.body.note).trim();
  if (note.length < 10) {
    return json({ success: false, message: "A note of at least 10 characters is required." }, 400);
  }
  tx.flaggedAt = new Date().toISOString();
  tx.flagReason = text(req.body.reason) || "OTHER";
  tx.flagSeverity = text(req.body.severity) || "MEDIUM";
  tx.flagNote = note;
  tx.flaggedByAdminId = PREVIEW_ADMIN_ID;
  tx.flagClearedAt = null;
  tx.flagClearedByAdminId = null;
  tx.flagResolution = null;
  audit(
    "TRANSACTION_FLAGGED",
    { transactionId: tx.id, reference: tx.reference, flagReason: tx.flagReason },
    { type: "transaction", id: tx.id },
    note,
  );
  return json({ success: true, message: "Transaction flagged for review.", data: tx });
});

route("POST", `${adminPaths.transactions}/:id/flag/clear`, (req, [id]) => {
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return notFound("Transaction not found");
  if (!tx.flaggedAt || tx.flagClearedAt) {
    return json(
      { success: false, code: "NOT_FLAGGED", message: "This transaction has no open flag." },
      409,
    );
  }
  const resolution = text(req.body.resolution).trim();
  if (resolution.length < 10) {
    return json(
      { success: false, message: "A resolution of at least 10 characters is required." },
      400,
    );
  }
  tx.flagClearedAt = new Date().toISOString();
  tx.flagClearedByAdminId = PREVIEW_ADMIN_ID;
  tx.flagResolution = resolution;
  audit(
    "TRANSACTION_FLAG_CLEARED",
    { transactionId: tx.id, reference: tx.reference, flagReason: tx.flagReason },
    { type: "transaction", id: tx.id },
    resolution,
  );
  return json({ success: true, message: "Flag cleared.", data: tx });
});

// KYC
route("GET", `${adminPaths.kyc}/list`, (req) => {
  const filter = req.query.get("filter") ?? "all";
  const term = req.query.get("search")?.toLowerCase();
  const matches = kycProfiles
    .filter((k) => {
      const statuses = [k.level1Status, k.level2Status, k.level3Status];
      if (filter === "pending") return statuses.includes("PENDING");
      if (filter === "verified") return statuses.includes("VERIFIED");
      if (filter === "rejected") return statuses.includes("REJECTED");
      return true;
    })
    .map(kycEntity)
    .filter(
      (e) =>
        !term ||
        contains(term, e.user?.email, e.user?.firstName, e.user?.lastName, e.user?.userName),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((e) => ({
      ...e,
      level1: {
        status: e.level1Status,
        identityType: e.identityType,
        identityNumber: e.identityNumber,
        bvn: e.bvn,
        verifiedFirstName: e.verifiedFirstName,
        verifiedLastName: e.verifiedLastName,
        verifiedAt: e.level1VerifiedAt,
      },
      level2: {
        status: e.level2Status,
        submitted: e.level2Status !== "NOT_STARTED",
        submittedAt: e.level2SubmittedAt,
        proofOfAddressType: e.proofOfAddressType,
        residentialAddress: e.residentialAddress,
        city: e.city,
        lgaName: e.lgaName,
        stateName: e.stateName,
        verifiedAt: e.level2VerifiedAt,
        rejectionReason: e.level2RejectionReason,
      },
      level3: {
        status: e.level3Status,
        submitted: e.level3Status !== "NOT_STARTED",
        governmentIdType: e.governmentIdType,
        governmentIdNumber: e.governmentIdNumber,
        livenessCheckPassed: e.livenessCheckPassed,
        faceMatchScore: e.faceMatchScore,
        verifiedAt: e.level3VerifiedAt,
        rejectionReason: e.level3RejectionReason,
      },
    }));
  const p = page(matches, req.query);
  return json({
    success: true,
    total: p.total,
    data: p.rows,
    pagination: { total: p.total, page: p.page, limit: p.limit },
  });
});
route("GET", `${adminPaths.kyc}/user/:id`, (_r, [id]) => {
  const k = kycProfiles.find((x) => x.userId === id);
  return json({
    data: {
      raw: k ? kycEntity(k) : null,
      dailySpent: "12500.00",
      remainingDailyLimit: "187500.00",
    },
  });
});
for (const [verb, status] of [
  ["verify", "VERIFIED"],
  ["reject", "REJECTED"],
] as const) {
  route("POST", `${adminPaths.kyc}/${verb}/:userId/:level`, (req, [userId, level]) => {
    const k = kycProfiles.find((x) => x.userId === userId);
    if (!k) return notFound("KYC profile not found");
    const key = `level${level}Status` as "level1Status" | "level2Status" | "level3Status";
    k[key] = status;
    k.updatedAt = new Date().toISOString();
    if (status === "REJECTED")
      k[`level${level}RejectionReason` as "level2RejectionReason"] = text(req.body.reason);
    const u = users.find((x) => x.id === userId);
    if (u && status === "VERIFIED") u.level = Math.max(u.level, Number(level));
    audit(
      status === "VERIFIED" ? "KYC_APPROVED" : "KYC_REJECTED",
      { userId, level: Number(level) },
      { type: "user", id: userId ?? "" },
      req.body.reason as string | undefined,
    );
    return ok();
  });
}

// Audit
route("GET", `${adminPaths.financial}/audit-logs`, (req) => {
  const q = req.query;
  const term = q.get("search")?.toLowerCase();
  const rows = auditLogs.filter(
    (l) =>
      (!q.get("action") || l.action === q.get("action")) &&
      (!q.get("adminId") || l.adminId === q.get("adminId")) &&
      (!q.get("targetId") || l.targetId === q.get("targetId")) &&
      (!q.get("from") && !q.get("to") ? true : inRange(l.createdAt, q.get("from"), q.get("to"))) &&
      (!term || contains(term, l.adminEmail, l.action, l.ipAddress, JSON.stringify(l.metadata))),
  );
  const limit = Number(q.get("limit") ?? 50);
  const offset = Number(q.get("offset") ?? 0);
  return json({
    success: true,
    data: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
  });
});
route("GET", `${adminPaths.financial}/audit-logs/stats`, () => {
  const counts: Record<string, number> = {};
  for (const l of auditLogs) counts[l.action] = (counts[l.action] ?? 0) + 1;
  return json({ success: true, data: counts });
});

// Exports and reports
route("POST", `${core}/exports`, (req) => exportFile(req.body));
route("GET", `${core}/reports/transactions`, (req) => json(transactionsReport(req.query)));
route("GET", `${core}/reports/users`, (req) => json(usersReport(req.query)));

// Administrators and roles
route("GET", `${core}/all`, () => json({ admins }));
route("GET", `${core}/roles`, () =>
  json({
    roles: roles.map((r) => ({
      ...r,
      assignedCount: admins.filter((a) => a.customRoleId === r.id).length,
    })),
  }),
);
route("POST", `${core}/roles`, (req) => {
  const role = {
    id: crypto.randomUUID(),
    name: String(req.body.name),
    description: text(req.body.description),
    permissions: (req.body.permissions as string[] | undefined) ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  roles.push(role);
  audit("ADMIN_ROLE_CREATED", { roleId: role.id, name: role.name }, { type: "role", id: role.id });
  return json({ role: { ...role, assignedCount: 0 } }, 201);
});
route("PUT", `${core}/roles/:id`, (req, [id]) => {
  const role = roles.find((r) => r.id === id);
  if (!role) return notFound("Role not found");
  Object.assign(role, {
    name: req.body.name,
    description: req.body.description,
    permissions: req.body.permissions,
    updatedAt: new Date().toISOString(),
  });
  const holders = admins.filter((a) => a.customRoleId === id);
  for (const a of holders) a.permissions = role.permissions;
  audit("ADMIN_ROLE_UPDATED", { roleId: id, name: role.name }, { type: "role", id: role.id });
  return json({ role: { ...role, assignedCount: holders.length }, affectedAdmins: holders.length });
});
route("DELETE", `${core}/roles/:id`, (_r, [id]) => {
  if (admins.some((a) => a.customRoleId === id))
    return json({ message: "This role is assigned to administrators. Reassign them first." }, 409);
  const index = roles.findIndex((r) => r.id === id);
  if (index >= 0) roles.splice(index, 1);
  return ok("Role deleted.");
});
route("POST", `${core}/create`, (req) => {
  const b = req.body;
  const role = roles.find((r) => r.id === b.customRoleId);
  const admin = {
    ...admins[1],
    id: crypto.randomUUID(),
    email: String(b.email),
    userName: String(b.userName),
    firstName: String(b.firstName),
    lastName: String(b.lastName),
    role: String(b.role),
    permissions: role?.permissions ?? (b.permissions as string[] | undefined) ?? [],
    customRoleId: role?.id ?? null,
    mustResetPassword: true,
    invitationExpiresAt: new Date(Date.now() + 3 * DAY).toISOString(),
    hasActivated2FA: false,
    trustedDeviceCount: 0,
    hasActiveSession: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
  admins.push(admin as (typeof admins)[number]);
  audit(
    "ADMIN_ACCOUNT_CREATED",
    { targetAdminId: admin.id, targetAdminEmail: admin.email },
    { type: "admin", id: admin.id },
  );
  return json({ message: "Invitation sent (preview: no email).", admin: { id: admin.id } }, 201);
});
function updateAdmin(
  id: string | undefined,
  patch: Partial<(typeof admins)[number]>,
  action: string,
) {
  const admin = admins.find((a) => a.id === id);
  if (!admin) return notFound("Admin not found");
  Object.assign(admin, patch);
  audit(
    action,
    { targetAdminId: admin.id, targetAdminEmail: admin.email },
    { type: "admin", id: admin.id },
  );
  return ok();
}
route("PUT", `${core}/:id/permissions`, (req, [id]) => {
  const role = roles.find((r) => r.id === req.body.customRoleId);
  return updateAdmin(
    id,
    {
      role: String(req.body.role),
      permissions: role?.permissions ?? (req.body.permissions as string[] | undefined) ?? [],
      customRoleId: role?.id ?? null,
    },
    "ADMIN_PERMISSIONS_UPDATED",
  );
});
route("POST", `${core}/:id/suspend`, (req, [id]) =>
  updateAdmin(
    id,
    {
      isSuspended: true,
      suspensionReason: text(req.body.reason),
      suspendedAt: new Date().toISOString(),
    },
    "ADMIN_ACCOUNT_SUSPENDED",
  ),
);
route("POST", `${core}/:id/unsuspend`, (_r, [id]) =>
  updateAdmin(id, { isSuspended: false, suspensionReason: null }, "ADMIN_ACCOUNT_UNSUSPENDED"),
);
route("POST", `${core}/:id/revoke-sessions`, (_r, [id]) =>
  updateAdmin(id, { hasActiveSession: false, trustedDeviceCount: 0 }, "ADMIN_SESSIONS_REVOKED"),
);
route("POST", `${core}/:id/resend-invitation`, (_r, [id]) =>
  updateAdmin(
    id,
    { invitationExpiresAt: new Date(Date.now() + 3 * DAY).toISOString() },
    "ADMIN_INVITATION_RESENT",
  ),
);
for (const path of [`${core}/:id/revoke-invitation`]) {
  route("POST", path, (_r, [id]) => {
    const index = admins.findIndex((a) => a.id === id);
    if (index > 0) admins.splice(index, 1);
    return ok("Invitation revoked.");
  });
}
route("DELETE", `${core}/:id`, (_r, [id]) => {
  const index = admins.findIndex((a) => a.id === id);
  if (index > 0) admins.splice(index, 1);
  return ok("Administrator removed.");
});

// Operations
route("GET", adminPaths.stranded, () => {
  const items = strandedTransfers.filter((s) => !s.alreadyRefunded);
  return json({ success: true, data: { items, summary: strandedSummary() } });
});
function strandedSummary() {
  const open = strandedTransfers.filter((s) => !s.alreadyRefunded);
  return {
    count: open.length,
    totalNaira: open.reduce((sum, s) => sum + s.owedNaira, 0),
    oldestHours: open.length ? Math.max(...open.map((s) => s.ageHours)) : 0,
  };
}
route("GET", `${adminPaths.stranded}/summary`, () =>
  json({ success: true, data: strandedSummary() }),
);
for (const resolution of ["delivered", "refund"]) {
  route("POST", `${adminPaths.stranded}/:ref/${resolution}`, (req, [ref]) => {
    const item = strandedTransfers.find((s) => s.reference === decodeURIComponent(ref ?? ""));
    if (!item) return notFound("Transaction not found");
    item.alreadyRefunded = true;
    audit(
      "STRANDED_TRANSFER_RESOLVED",
      { reference: item.reference, resolution: resolution.toUpperCase(), note: req.body.note },
      { type: "transaction", id: item.reference },
      req.body.note as string,
    );
    return json({
      success: true,
      message:
        resolution === "refund"
          ? `₦${item.owedNaira.toLocaleString()} returned to the customer.`
          : "Marked as delivered.",
    });
  });
}
route("GET", `${core}/reversal-candidates`, () =>
  json({ success: true, data: reversalCandidates, count: reversalCandidates.length }),
);
route("POST", `${core}/reverse-transaction`, (req) => {
  const index = reversalCandidates.findIndex((c) => c.reference === req.body.reference);
  const candidate = reversalCandidates[index];
  if (!candidate)
    return json({ success: false, message: "Transaction not found or already reversed." }, 409);
  reversalCandidates.splice(index, 1);
  audit(
    "TRANSACTION_REVERSED",
    { reference: candidate.reference, amount: candidate.amount },
    { type: "transaction", id: candidate.reference },
    req.body.reason as string,
  );
  return json({
    success: true,
    message: `₦${Number(candidate.amount).toLocaleString()} returned to the customer.`,
  });
});

// Compliance
const cmp = adminPaths.compliance;
route("GET", `${cmp}/dashboard`, () => {
  const open = complianceAlerts.filter((a) => a.status === "OPEN" || a.status === "UNDER_REVIEW");
  return json({
    success: true,
    data: {
      alerts: {
        open: open.length,
        critical: open.filter((a) => a.severity === "CRITICAL").length,
        oldestOpenAt: null,
        oldestOpenAgeDays: 9,
      },
      customers: { total: users.length, highRisk: 3, pep: 1, neverProfiled: users.length - 6 },
      reports: {
        open: complianceReports.filter((r) => !["FILED", "NOT_REPORTED"].includes(r.status)).length,
        filed: complianceReports.filter((r) => r.status === "FILED").length,
      },
    },
  });
});
route("GET", `${cmp}/alerts`, (req) => {
  const q = req.query;
  const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const rows = complianceAlerts
    .filter(
      (a) =>
        (!q.get("status") || a.status === q.get("status")) &&
        (!q.get("severity") || a.severity === q.get("severity")) &&
        (!q.get("rule") || a.rule === q.get("rule")) &&
        (!q.get("userId") || a.userId === q.get("userId")),
    )
    .sort(
      (a, b) =>
        order.indexOf(a.severity) - order.indexOf(b.severity) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const p = page(rows, q, 25);
  return json({
    success: true,
    data: p.rows,
    pagination: {
      page: p.page,
      limit: p.limit,
      total: p.total,
      pages: Math.ceil(p.total / p.limit),
    },
  });
});
const profileFor = (userId: string) => ({
  id: `profile-${userId}`,
  userId,
  riskRating: "MEDIUM",
  riskRationale: "Higher-than-typical crypto withdrawal volume for the declared occupation.",
  riskRatingSetAt: new Date(PREVIEW_NOW - 20 * DAY).toISOString(),
  nextReviewAt: new Date(PREVIEW_NOW + 160 * DAY).toISOString(),
  lastReviewedAt: new Date(PREVIEW_NOW - 20 * DAY).toISOString(),
  pepStatus: "NOT_PEP",
  pepNote: null,
  pepDeterminedAt: null,
  sourceOfFunds: "SALARY",
  sourceOfFundsDetail: null,
  sourceOfWealth: null,
  occupation: "Software engineer",
  expectedMonthlyVolume: "750000.00",
  eddRequired: false,
  eddCompleted: false,
  updatedAt: new Date(PREVIEW_NOW - 20 * DAY).toISOString(),
});
route("GET", `${cmp}/alerts/:id`, (_r, [id]) => {
  const alert = complianceAlerts.find((a) => a.id === id);
  if (!alert) return notFound("Alert not found");
  return json({
    success: true,
    data: {
      alert,
      complianceProfile: profileFor(alert.userId),
      relatedAlerts: complianceAlerts.filter((a) => a.userId === alert.userId),
    },
  });
});
route("POST", `${cmp}/alerts/:id/disposition`, (req, [id]) => {
  const alert = complianceAlerts.find((a) => a.id === id);
  if (!alert) return notFound("Alert not found");
  Object.assign(alert, {
    status: req.body.status,
    reviewNote: req.body.note,
    reviewedAt: new Date().toISOString(),
    reviewedBy: PREVIEW_ADMIN_ID,
  });
  audit(
    "COMPLIANCE_ALERT_DISPOSITIONED",
    { alertId: id, subjectUserId: alert.userId, newStatus: req.body.status },
    { type: "user", id: alert.userId },
    req.body.note as string,
  );
  return ok("Alert dispositioned");
});
route("GET", `${cmp}/profile/:userId`, (_r, [userId]) =>
  json({ success: true, data: { profile: profileFor(userId ?? ""), alerts: [], reports: [] } }),
);
route("PATCH", `${cmp}/profile/:userId`, () => ok("Compliance profile updated"));
route("GET", `${cmp}/reports`, (req) => {
  const rows = complianceReports.filter(
    (r) =>
      (!req.query.get("status") || r.status === req.query.get("status")) &&
      (!req.query.get("reportType") || r.reportType === req.query.get("reportType")),
  );
  const p = page(rows, req.query, 25);
  return json({
    success: true,
    data: p.rows,
    pagination: {
      page: p.page,
      limit: p.limit,
      total: p.total,
      pages: Math.ceil(p.total / p.limit),
    },
  });
});
route("POST", `${cmp}/reports`, (req) => {
  const u = users.find((x) => x.id === req.body.userId);
  const report = {
    ...complianceReports[0],
    id: crypto.randomUUID(),
    reference: `STR-2026-${String(complianceReports.length + 1).padStart(4, "0")}`,
    userId: String(req.body.userId),
    user: u
      ? {
          id: u.id,
          email: u.email,
          userName: u.userName,
          firstName: u.firstName,
          lastName: u.lastName,
        }
      : null,
    reportType: text(req.body.reportType) || "STR",
    status: "INTERNAL_ESCALATION",
    suspicionGrounds: String(req.body.suspicionGrounds),
    amountInvolved: (req.body.amountInvolved as string | undefined) ?? null,
    assessedAt: null,
    assessmentRationale: null,
    filedAt: null,
    nfiuReference: null,
    createdAt: new Date().toISOString(),
  };
  complianceReports.unshift(report as (typeof complianceReports)[number]);
  for (const alertId of (req.body.alertIds as string[] | undefined) ?? []) {
    const alert = complianceAlerts.find((a) => a.id === alertId);
    if (alert) alert.status = "REPORTED";
  }
  return json(
    {
      success: true,
      message: `${report.reportType} ${report.reference} raised and awaiting MLRO assessment.`,
      data: report,
    },
    201,
  );
});
route("POST", `${cmp}/reports/:id/assess`, (req, [id]) => {
  const report = complianceReports.find((r) => r.id === id);
  if (!report) return notFound("Report not found");
  Object.assign(report, {
    status: req.body.decision === "REPORT" ? "PENDING_FILING" : "NOT_REPORTED",
    assessedAt: new Date().toISOString(),
    assessmentRationale: req.body.rationale,
  });
  return ok("Assessment recorded");
});
route("POST", `${cmp}/reports/:id/file`, (req, [id]) => {
  const report = complianceReports.find((r) => r.id === id);
  if (!report) return notFound("Report not found");
  Object.assign(report, {
    status: "FILED",
    filedAt: new Date().toISOString(),
    nfiuReference: req.body.nfiuReference,
    filingNote: req.body.filingNote ?? null,
  });
  return ok("Recorded as filed");
});

// Risk
const risk = adminPaths.risk;
route("GET", `${risk}/overview`, () => {
  const active = fundHolds.filter((h) => h.status === "ACTIVE");
  return json({
    success: true,
    data: {
      cases: {
        open: riskCases.filter((c) => c.status === "OPEN").length,
        awaitingCustomer: riskCases.filter((c) => c.status === "AWAITING_CUSTOMER").length,
        overdue: riskCases.filter(
          (c) =>
            ["OPEN", "AWAITING_CUSTOMER", "UNDER_REVIEW"].includes(c.status) &&
            c.dueAt < new Date().toISOString(),
        ).length,
      },
      holds: {
        active: active.length,
        totalHeldNaira: active.reduce((s, h) => s + Number(h.amountNaira), 0),
      },
      interventionsLast7Days: 4,
    },
  });
});
route("GET", `${risk}/cases`, (req) =>
  json({
    success: true,
    data: riskCases.filter(
      (c) =>
        (!req.query.get("status") || c.status === req.query.get("status")) &&
        (!req.query.get("severity") || c.severity === req.query.get("severity")),
    ),
  }),
);
route("POST", `${risk}/cases/:id/request-evidence`, (req, [id]) => {
  const c = riskCases.find((x) => x.id === id);
  if (!c) return notFound("Case not found");
  Object.assign(c, {
    status: "AWAITING_CUSTOMER",
    evidenceRequested: req.body.evidenceRequested,
    evidenceRequestedAt: new Date().toISOString(),
  });
  return ok("Evidence requested");
});
route("POST", `${risk}/cases/:id/resolve`, (req, [id]) => {
  const c = riskCases.find((x) => x.id === id);
  if (!c) return notFound("Case not found");
  Object.assign(c, {
    status: req.body.outcome,
    resolution: req.body.resolution,
    resolvedAt: new Date().toISOString(),
  });
  if (req.body.outcome === "CLEARED")
    for (const h of fundHolds) if (h.caseId === id) h.status = "RELEASED";
  return ok(
    req.body.outcome === "CLEARED" ? "Case cleared and its holds released." : "Case resolved.",
  );
});
route("GET", `${risk}/holds`, () => {
  const active = fundHolds.filter((h) => h.status === "ACTIVE");
  return json({ success: true, data: active, count: active.length });
});
route("POST", `${risk}/holds`, (req) => {
  fundHolds.push({
    id: crypto.randomUUID(),
    userId: String(req.body.userId),
    assetType: "NAIRA",
    currency: null,
    amountCrypto: null,
    amountNaira: String(req.body.amountNaira),
    status: "ACTIVE",
    reason: String(req.body.reason),
    caseId: null,
    transactionReference: (req.body.transactionReference as string | undefined) ?? null,
    createdAt: new Date().toISOString(),
  });
  audit(
    "RISK_HOLD_PLACED",
    { targetUserId: req.body.userId, amountNaira: req.body.amountNaira },
    { type: "user", id: String(req.body.userId) },
    String(req.body.reason),
  );
  return json(
    {
      success: true,
      message: `₦${Number(req.body.amountNaira).toLocaleString()} held. The rest of the balance is unaffected.`,
    },
    201,
  );
});
route("POST", `${risk}/holds/:id/release`, (req, [id]) => {
  const hold = fundHolds.find((h) => h.id === id && h.status === "ACTIVE");
  if (!hold) return json({ success: false, message: "That hold is already released." }, 409);
  hold.status = "RELEASED";
  audit(
    "RISK_HOLD_RELEASED",
    { holdId: id },
    { type: "hold", id: id ?? "" },
    String(req.body.reason),
  );
  return json({
    success: true,
    message: `₦${Number(hold.amountNaira).toLocaleString()} released back to the customer.`,
  });
});

// Treasury
const fin = adminPaths.financial;
route("GET", `${fin}/nomba/balance`, () => {
  const liability = users.reduce((s, u) => s + Number(u.walletBalance), 0);
  const balance = payoutProviders[0]?.cachedBalance ?? 0;
  return json({
    data: {
      balance,
      currency: "NGN",
      lastSynced: new Date().toISOString(),
      totalUserLiability: liability,
      coverage: balance - liability,
      isUnderFunded: balance < liability,
    },
  });
});
route("GET", `${fin}/payout-providers`, () => json({ success: true, data: payoutProviders }));

/**
 * The one call the treasury page's headline figures come from.
 *
 * Returns the accounts, the customer liability and the coverage together, so
 * the three numbers on screen were read at the same instant — which is the
 * whole reason the console uses this instead of assembling them itself.
 */
route("GET", `${fin}/payout-providers/balances`, () => {
  const liability = users.reduce((sum, u) => sum + Number(u.walletBalance), 0);
  const active = payoutProviders.find((p) => p.isActive) ?? payoutProviders[0];
  const coverage = (active?.cachedBalance ?? 0) - liability;
  return json({
    success: true,
    data: {
      providers: payoutProviders,
      activeProvider: active ?? null,
      nombaSettlement: {
        balance: payoutProviders[0]?.cachedBalance ?? 0,
        currency: "NGN",
        lastSynced: new Date().toISOString(),
      },
      totalUserLiability: liability,
      coverage,
      isUnderFunded: coverage < 0,
    },
  });
});

route("POST", `${fin}/payout-providers/sync-balance`, (req) => {
  const provider = payoutProviders.find((p) => p.id === text(req.body.providerId));
  if (!provider) return notFound("Provider not found");
  provider.lastSyncedAt = new Date().toISOString();
  return json({ success: true, message: "Provider balance synced successfully.", data: provider });
});

route("POST", `${fin}/payout-providers/switch`, (req) => {
  const provider = payoutProviders.find((p) => p.id === text(req.body.providerId));
  if (!provider) return notFound("Provider not found");
  for (const p of payoutProviders) p.isActive = p.id === provider.id;
  audit(
    "PAYOUT_PROVIDER_SWITCHED",
    { providerId: provider.id, provider: provider.provider },
    { type: "payoutProvider", id: provider.id },
  );
  return json({
    success: true,
    message: `Active payout provider successfully switched to ${provider.name}`,
    data: provider,
  });
});

route("GET", `${fin}/transfers`, (req) => {
  const direction = req.query.get("direction");
  const status = req.query.get("status");
  const from = req.query.get("startDate");
  const to = req.query.get("endDate");
  const rows = treasuryMovements.filter(
    (m) =>
      (!direction || m.transferDirection === direction) &&
      (!status || m.status === status) &&
      (!from && !to ? true : inRange(m.createdAt, from, to)),
  );
  const paged = page(rows, req.query, 25);
  return json({
    data: {
      transfers: paged.rows,
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: Math.max(1, Math.ceil(paged.total / paged.limit)),
    },
  });
});

/* ─── Crypto reserves ────────────────────────────────────────────────────── */

const adminWallet = adminPaths.wallet;

route("GET", `${adminWallet}/get-wallets`, () =>
  json({ message: "Admin wallets fetched successfully", wallets: cryptoReserves }),
);

route("POST", `${adminWallet}/sync-balances`, () =>
  json({
    message: "Admin wallet balances synced successfully",
    wallets: cryptoReserves,
    syncedAt: new Date().toISOString(),
  }),
);

route("GET", `${adminWallet}/withdrawal-limit`, () => {
  // A used figure well short of the ceiling, so the dialog shows a budget
  // rather than a block — the block is the exceptional state, not the default.
  const limit = 5_000_000;
  const used = 1_250_000;
  return json({
    success: true,
    data: { limit, used, remaining: limit - used, currency: "NGN", windowHours: 24 },
  });
});

/**
 * Resolve a withdrawal destination.
 *
 * Mirrors the API's three verdicts, because they are what the dialog branches
 * on: a known username is internal and free, a long opaque string is external
 * and irreversible, and anything else is refused outright.
 */
route("POST", `${adminWallet}/resolve-recipient`, (req) => {
  const identifier = text(req.body.identifier).trim();
  const currency = text(req.body.currency).toUpperCase();
  if (!identifier) return json({ success: false, data: { kind: "not_found" } });

  const owner = users.find(
    (u) =>
      u.userName.toLowerCase() === identifier.toLowerCase() ||
      u.email.toLowerCase() === identifier.toLowerCase(),
  );
  if (owner) {
    return json({
      success: true,
      data: {
        kind: "internal",
        via: identifier.includes("@") ? "email" : "username",
        onChain: false,
        feeApplies: false,
        recipientName: fullName(owner),
        recipientUserName: owner.userName,
        note: "Flurrypay to Flurrypay — no network fee.",
      },
    });
  }

  if (identifier.length >= 20 && !identifier.includes("@")) {
    return json({
      success: true,
      data: {
        kind: "external",
        via: "address",
        onChain: true,
        feeApplies: true,
        address: identifier,
        feeEstimate: { fee: currency === "BTC" ? 0.0002 : 1.2, currency },
        note: "This address is outside Flurrypay. The transfer goes on-chain, costs a network fee, and cannot be reversed.",
      },
    });
  }

  return json({
    success: false,
    data: {
      kind: "not_found",
      message: `No Flurrypay account uses ${identifier}.`,
    },
  });
});

route("POST", `${adminWallet}/withdrawal`, (req) => {
  const currency = text(req.body.currency).toUpperCase();
  const amount = Number(req.body.amount);
  const reserve = cryptoReserves.find((r) => r.coinTicker === currency);
  if (!reserve) return notFound(`No ${currency} reserve`);
  if (!(amount > 0)) return json({ message: "amount must be a positive number" }, 400);

  const held = Number(reserve.coinBalance.cryptoBalance);
  if (amount > held) {
    return json({ message: `The ${currency} reserve holds ${held}.` }, 400);
  }
  reserve.coinBalance.cryptoBalance = (held - amount).toFixed(8);
  audit(
    "MAKE_WITHDRAWAL",
    { currency, amount, destination: text(req.body.address) || text(req.body.userName) },
    { type: "treasury", id: currency },
  );
  return json({
    message: "Withdrawal sent (preview only: nothing leaves this browser).",
    transactionReference: `PRV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
  });
});
route("GET", `${fin}/earnings`, (req) => {
  const q = req.query;
  const rows = earnings.filter(
    (e) =>
      (!q.get("transactionType") || e.transactionType === q.get("transactionType")) &&
      (!q.get("startDate") && !q.get("endDate")
        ? true
        : inRange(e.createdAt, q.get("startDate"), q.get("endDate"))),
  );
  const p = page(rows, q, 20);
  return json({
    data: {
      earnings: p.rows,
      total: p.total,
      page: p.page,
      limit: p.limit,
      totalPages: Math.ceil(p.total / p.limit),
    },
  });
});
route("GET", `${fin}/earnings/breakdown`, (req) => {
  const rows = earnings.filter((e) =>
    inRange(e.createdAt, req.query.get("startDate"), req.query.get("endDate")),
  );
  const sum = (type: string) =>
    rows.filter((e) => e.transactionType === type).reduce((s, e) => s + Number(e.profit), 0);
  const buy = sum("buy");
  const sell = sum("sell");
  const swap = sum("swap");
  const transfer =
    transactions.filter((t) => t.transactionType === "FIAT_WITHDRAWAL" && t.status === "COMPLETED")
      .length * 50;
  return json({
    data: {
      cryptoBuyCommissions: buy,
      cryptoSaleCommissions: sell,
      swapFees: swap,
      transferFees: transfer,
      otherEarnings: 0,
      total: buy + sell + swap + transfer,
    },
  });
});

// Rates
route("GET", `${adminPaths.companyDetails}/rates`, () => json(rates));
route("PATCH", `${adminPaths.companyDetails}/rates`, (req) => {
  const { twoFACode: _code, ...changes } = req.body;
  Object.assign(rates, changes);
  audit("RATE_UPDATED", changes, { type: "settings", id: "rates" });
  return json({ message: "Rates updated successfully", rates });
});

/* ─── Entry point ────────────────────────────────────────────────────────── */

/** A `fetch` that answers from the preview data after a short, realistic delay. */
export async function previewFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  let body: Json = {};
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body) as Json;
    } catch {
      body = {};
    }
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 120 + Math.random() * 180);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue;
    const match = pattern.exec(url.pathname);
    if (match)
      return handler(
        { method, path: url.pathname, query: url.searchParams, body },
        match.slice(1).map(decodeURIComponent),
      );
  }
  // Anything not modelled (sign-in steps, 2FA and PIN changes): accept writes, refuse reads.
  return method === "GET" ? notFound("This screen has no preview data.") : ok();
}
