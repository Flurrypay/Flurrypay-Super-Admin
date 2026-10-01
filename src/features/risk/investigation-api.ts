import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

/**
 * The investigation layer, as opposed to detection.
 *
 * `api.ts` covers cases and holds as records. `monitoring-api.ts` covers the
 * engine that produced them. This covers the work: what has been done on a
 * case, who owns it, what has been checked, and what the account is connected
 * to.
 *
 * Every schema here is tolerant in the same way as the rest of the console —
 * an unexpected null in one field degrades that field rather than blanking the
 * page an investigator is trying to read under pressure.
 */

const base = adminPaths.risk;
const count = z.coerce.number().catch(0);
/**
 * A numeric field that is legitimately absent.
 *
 * `.nullish()` alone would let `undefined` through, and `number | undefined`
 * forces an extra guard at every render site for a distinction that means
 * nothing here — absent and null are the same thing to a reader.
 */
const nullableNumber = z.coerce
  .number()
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);
const messageSchema = z.object({ message: z.string().catch("") });

// ── Case timeline ───────────────────────────────────────────────────

export const CASE_EVENT_TYPES = [
  "NOTE",
  "STATUS_CHANGE",
  "ASSIGNMENT",
  "ESCALATION",
  "EVIDENCE_REQUESTED",
  "EVIDENCE_SUBMITTED",
  "ACTION_TAKEN",
  "HOLD_PLACED",
  "HOLD_RELEASED",
  "CHECKLIST_UPDATED",
  "DECISION",
  "SYSTEM",
] as const;
export type CaseEventType = (typeof CASE_EVENT_TYPES)[number];

export const caseEventSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  type: z.string().catch("SYSTEM"),
  actorType: z.string().catch("SYSTEM"),
  actorId: nullableString,
  actorEmail: nullableString,
  visibility: z.string().catch("INTERNAL"),
  summary: z.string().catch(""),
  body: nullableString,
  detail: z.record(z.string(), z.unknown()).nullish().catch(null),
  createdAt: timestamp,
});
export type CaseEvent = z.output<typeof caseEventSchema>;

// ── Checklist ───────────────────────────────────────────────────────

export const CHECKLIST_STATES = ["PENDING", "DONE", "NOT_APPLICABLE"] as const;
export type ChecklistState = (typeof CHECKLIST_STATES)[number];

const checklistItemSchema = z.object({
  key: z.string(),
  label: z.string().catch(""),
  state: z.enum(CHECKLIST_STATES).catch("PENDING"),
  note: nullableString,
  updatedAt: timestamp,
});
export type ChecklistItem = z.output<typeof checklistItemSchema>;

// ── Dossier ─────────────────────────────────────────────────────────

const dossierUserSchema = z
  .object({
    id: z.string().catch(""),
    email: nullableString,
    firstName: nullableString,
    lastName: nullableString,
    phoneNumber: nullableString,
    walletBalance: decimal,
    isBlocked: z.boolean().catch(false),
    isSuspended: z.boolean().catch(false),
    outboundRestricted: z.boolean().catch(false),
    createdAt: timestamp,
  })
  .nullish()
  .catch(null);

const dossierCaseSchema = z.object({
  id: z.string(),
  reference: z.string().catch(""),
  userId: z.string().catch(""),
  status: z.string().catch("OPEN"),
  severity: z.string().catch("MEDIUM"),
  trigger: z.string().catch(""),
  description: nullableString,
  riskScore: z.number().nullish().catch(null),
  heldAmountNaira: decimal,
  heldTransactionReference: nullableString,
  queue: nullableString,
  assignedToAdminId: nullableString,
  assignedAt: timestamp,
  escalatedAt: timestamp,
  escalationReason: nullableString,
  dueAt: timestamp,
  resolution: nullableString,
  resolvedAt: timestamp,
  createdAt: timestamp,
});

export const passThroughSchema = z.object({
  windowDays: count,
  inflowNaira: z.coerce.number().catch(0),
  outflowNaira: z.coerce.number().catch(0),
  retainedNaira: z.coerce.number().catch(0),
  passThroughRatio: z.coerce.number().catch(0),
  averageHoldingHours: nullableNumber,
  inflowCount: count,
  outflowCount: count,
  distinctDestinations: count,
  interpretation: z.string().catch(""),
});
export type PassThroughMetrics = z.output<typeof passThroughSchema>;

const dossierSchema = z.object({
  case: dossierCaseSchema,
  checklist: z.array(checklistItemSchema).catch([]),
  assignee: z
    .object({
      id: z.string().catch(""),
      email: z.string().catch(""),
      name: z.string().catch(""),
    })
    .nullish()
    .catch(null),
  user: dossierUserSchema,
  timeline: z.array(caseEventSchema).catch([]),
  alerts: z
    .array(
      z.object({
        id: z.string(),
        rule: z.string().catch(""),
        severity: z.string().catch("MEDIUM"),
        status: z.string().catch("OPEN"),
        summary: z.string().catch(""),
        createdAt: timestamp,
      }),
    )
    .catch([]),
  assessments: z
    .array(
      z.object({
        id: z.string(),
        eventType: z.string().catch(""),
        amountNaira: decimal,
        riskScore: count,
        action: z.string().catch("ALLOW"),
        transactionReference: nullableString,
        signals: z
          .array(
            z.object({
              rule: z.string().catch(""),
              points: count,
              detail: z.string().catch(""),
            }),
          )
          .catch([]),
        createdAt: timestamp,
      }),
    )
    .catch([]),
  holds: z
    .array(
      z.object({
        id: z.string(),
        status: z.string().catch(""),
        amountNaira: decimal,
        amountCrypto: decimal,
        currency: nullableString,
        reason: z.string().catch(""),
        createdAt: timestamp,
      }),
    )
    .catch([]),
  passThrough: passThroughSchema.nullish().catch(null),
});
export type CaseDossier = z.output<typeof dossierSchema>;

/** Everything about one case in a single request — see the API route on why. */
export function fetchCaseDossier(caseId: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/cases/${encodeURIComponent(caseId)}/dossier`, {
    schema: z.object({ data: dossierSchema }).transform((v) => v.data),
    signal,
  });
}

export function addCaseNote(
  caseId: string,
  input: { body: string; visibility?: "INTERNAL" | "CUSTOMER_VISIBLE" },
) {
  return adminApi.post(`${base}/cases/${encodeURIComponent(caseId)}/notes`, input);
}

export function assignCase(
  caseId: string,
  input: { assignedToAdminId: string | null; queue?: string; note?: string },
) {
  return adminApi.post(`${base}/cases/${encodeURIComponent(caseId)}/assign`, input);
}

export function escalateCase(
  caseId: string,
  input: {
    reason: string;
    escalatedToAdminId?: string | null;
    queue?: string;
    severity?: string;
  },
) {
  return adminApi.post(`${base}/cases/${encodeURIComponent(caseId)}/escalate`, input);
}

export function updateCaseChecklist(
  caseId: string,
  items: Array<{ key: string; state: ChecklistState; note?: string | null }>,
) {
  return adminApi.patch(
    `${base}/cases/${encodeURIComponent(caseId)}/checklist`,
    { items },
    { schema: z.object({ data: z.object({ checklist: z.array(checklistItemSchema) }) }) },
  );
}

/**
 * Whether a disposition would be accepted, and what is missing.
 *
 * The same check runs on the resolve route. This is so the requirement is
 * visible before somebody writes a resolution, not a substitute for the
 * server-side control.
 */
export function fetchClosureReadiness(caseId: string, outcome: string, signal?: AbortSignal) {
  return adminApi.get(
    `${base}/cases/${encodeURIComponent(caseId)}/closure-readiness?outcome=${encodeURIComponent(outcome)}`,
    {
      schema: z
        .object({
          data: z.object({
            ready: z.boolean().catch(true),
            blockers: z.array(z.string()).catch([]),
          }),
        })
        .transform((v) => v.data),
      signal,
    },
  );
}

const assignableAdminSchema = z.object({
  id: z.string(),
  email: z.string().catch(""),
  name: z.string().catch(""),
  role: z.string().catch(""),
});
export type AssignableAdmin = z.output<typeof assignableAdminSchema>;

export function fetchAssignableAdmins(signal?: AbortSignal) {
  return adminApi.get(`${base}/assignable-admins`, {
    schema: z.object({ data: z.array(assignableAdminSchema).catch([]) }).transform((v) => v.data),
    signal,
  });
}

// ── Queues ──────────────────────────────────────────────────────────

const queueCountsSchema = z.object({
  critical: count,
  high: count,
  unassigned: count,
  mine: count,
  overdue: count,
  escalated: count,
  awaitingCustomer: count,
});
export type QueueCounts = z.output<typeof queueCountsSchema>;

export function fetchQueueCounts(signal?: AbortSignal) {
  return adminApi.get(`${base}/queues`, {
    schema: z.object({ data: queueCountsSchema }).transform((v) => v.data),
    signal,
  });
}

// ── Network ─────────────────────────────────────────────────────────

export const LINK_TYPES = [
  "SHARED_DEVICE",
  "SHARED_BENEFICIARY",
  "SHARED_CRYPTO_DESTINATION",
  "SHARED_IP",
  "SHARED_PHONE",
  "SHARED_EMAIL_ROOT",
] as const;
export type LinkType = (typeof LINK_TYPES)[number];

const linkedAccountSchema = z.object({
  userId: z.string(),
  email: nullableString,
  firstName: nullableString,
  lastName: nullableString,
  phoneNumber: nullableString,
  isBlocked: z.boolean().catch(false),
  isSuspended: z.boolean().catch(false),
  outboundRestricted: z.boolean().catch(false),
  createdAt: timestamp,
});
export type LinkedAccount = z.output<typeof linkedAccountSchema>;

const entityLinkSchema = z.object({
  type: z.string().catch("SHARED_DEVICE"),
  strength: z.enum(["WEAK", "MODERATE", "STRONG"]).catch("WEAK"),
  value: z.string().catch(""),
  label: z.string().catch(""),
  interpretation: z.string().catch(""),
  accounts: z.array(linkedAccountSchema).catch([]),
});
export type EntityLink = z.output<typeof entityLinkSchema>;

const networkSchema = z.object({
  userId: z.string().catch(""),
  links: z.array(entityLinkSchema).catch([]),
  passThrough: passThroughSchema.nullish().catch(null),
  caveat: z.string().catch(""),
});
export type UserNetwork = z.output<typeof networkSchema>;

export function fetchUserNetwork(userId: string, windowDays = 30, signal?: AbortSignal) {
  return adminApi.get(
    `${base}/network/user/${encodeURIComponent(userId)}?windowDays=${windowDays}`,
    {
      schema: z.object({ data: networkSchema }).transform((v) => v.data),
      signal,
    },
  );
}

// ── Counterparty ────────────────────────────────────────────────────

export const COUNTERPARTY_TYPES = ["BANK_ACCOUNT", "WALLET_ADDRESS"] as const;
export type CounterpartyType = (typeof COUNTERPARTY_TYPES)[number];

const counterpartySchema = z.object({
  entityType: z.string().catch("BANK_ACCOUNT"),
  entityValue: z.string().catch(""),
  label: nullableString,
  firstSeen: timestamp,
  lastSeen: timestamp,
  distinctUsers: count,
  transactionCount: count,
  totalValueNaira: decimal,
  users: z.array(linkedAccountSchema).catch([]),
  watchlisted: z.boolean().catch(false),
  watchlistSeverity: nullableString,
  watchlistReason: nullableString,
});
export type CounterpartyProfile = z.output<typeof counterpartySchema>;

export function fetchCounterparty(
  entityType: CounterpartyType,
  entityValue: string,
  signal?: AbortSignal,
) {
  return adminApi.get(
    `${base}/counterparty?entityType=${entityType}&entityValue=${encodeURIComponent(entityValue)}`,
    {
      schema: z.object({ data: counterpartySchema }).transform((v) => v.data),
      signal,
    },
  );
}

// ── Account takeover ────────────────────────────────────────────────

const atoSignalSchema = z.object({
  key: z.string().catch(""),
  points: count,
  detail: z.string().catch(""),
  at: timestamp,
  evidence: z.record(z.string(), z.unknown()).nullish().catch(null),
});

const atoTimelineSchema = z.object({
  at: timestamp,
  kind: z.enum(["SECURITY", "DEVICE", "MONEY", "AUTH_FAILURE"]).catch("SECURITY"),
  action: z.string().catch(""),
  ipAddress: nullableString,
  deviceInfo: nullableString,
  amountNaira: nullableNumber,
});
export type AtoTimelineEntry = z.output<typeof atoTimelineSchema>;

const atoSchema = z.object({
  userId: z.string().catch(""),
  windowHours: count,
  score: count,
  band: z.enum(["NONE", "LOW", "ELEVATED", "HIGH", "CRITICAL"]).catch("NONE"),
  signals: z.array(atoSignalSchema).catch([]),
  timeline: z.array(atoTimelineSchema).catch([]),
  narrative: z.string().catch(""),
});
export type AtoAssessment = z.output<typeof atoSchema>;

export function fetchAccountTakeover(userId: string, windowHours = 24, signal?: AbortSignal) {
  return adminApi.get(
    `${base}/account-takeover/${encodeURIComponent(userId)}?windowHours=${windowHours}`,
    {
      schema: z.object({ data: atoSchema }).transform((v) => v.data),
      signal,
    },
  );
}

// ── Search ──────────────────────────────────────────────────────────

const searchHitSchema = z.object({
  kind: z.string().catch(""),
  id: z.string().catch(""),
  title: z.string().catch(""),
  subtitle: nullableString,
  href: nullableString,
  badge: nullableString,
  matchedOn: z.string().catch(""),
});
export type FraudSearchHit = z.output<typeof searchHitSchema>;

export function fraudSearch(term: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/search?q=${encodeURIComponent(term)}`, {
    schema: z.object({ data: z.array(searchHitSchema).catch([]) }).transform((v) => v.data),
    signal,
  });
}

// ── Saved views ─────────────────────────────────────────────────────

const savedViewSchema = z.object({
  id: z.string(),
  surface: z.string().catch(""),
  name: z.string().catch(""),
  filters: z.record(z.string(), z.unknown()).catch({}),
  isShared: z.boolean().catch(false),
  isOwn: z.boolean().catch(false),
  updatedAt: timestamp,
});
export type SavedView = z.output<typeof savedViewSchema>;

export function fetchSavedViews(surface: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/saved-views?surface=${encodeURIComponent(surface)}`, {
    schema: z.object({ data: z.array(savedViewSchema).catch([]) }).transform((v) => v.data),
    signal,
  });
}

export function saveView(input: {
  surface: string;
  name: string;
  filters: Record<string, unknown>;
  isShared?: boolean;
}) {
  return adminApi.post(`${base}/saved-views`, input);
}

export function deleteSavedView(id: string) {
  return adminApi.delete(`${base}/saved-views/${encodeURIComponent(id)}`, {
    schema: messageSchema,
  });
}
