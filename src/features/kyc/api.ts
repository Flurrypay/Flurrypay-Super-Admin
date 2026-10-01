import { z } from "zod";

import { env } from "@/env";
import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const base = adminPaths.kyc;

export const KYC_STATUSES = ["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_FILTERS = ["pending", "verified", "rejected", "all"] as const;
export type KycFilter = (typeof KYC_FILTERS)[number];
export type KycLevel = 1 | 2 | 3;

/** Keeps only the last four characters of an identity number (BVN/NIN/ID). */
const last4 = z
  .unknown()
  .optional()
  .transform((value) => (typeof value === "string" && value.length >= 4 ? value.slice(-4) : null));

const status = z.enum(KYC_STATUSES).catch("NOT_STARTED");

/**
 * Allowlisted KYC fields. The API returns full BVN/NIN numbers and raw provider
 * payloads (docs/03-gaps-and-security.md S4); only the last four digits of
 * identifiers are kept, and provider payloads are discarded at parse time.
 */
export const kycProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  user: z
    .object({
      firstName: z.string().catch(""),
      lastName: z.string().catch(""),
      email: z.string(),
      userName: nullableString,
    })
    .nullish()
    .catch(null),
  currentLevel: z.number().catch(0),
  dailyWithdrawalLimit: decimal,
  isKYCCompleted: z.boolean().catch(false),
  level1: z.object({
    status,
    identityType: nullableString,
    identityNumberLast4: last4,
    bvnLast4: last4,
    ninLast4: last4,
    verifiedAt: timestamp,
    verifiedFirstName: nullableString,
    verifiedMiddleName: nullableString,
    verifiedLastName: nullableString,
    verifiedGender: nullableString,
    verifiedBirthdate: nullableString,
    verifiedPhotoUrl: nullableString,
    nameMismatch: z.boolean().catch(false),
  }),
  level2: z.object({
    status,
    submitted: z.boolean().catch(false),
    submittedAt: timestamp,
    proofOfAddressType: nullableString,
    residentialAddress: nullableString,
    city: nullableString,
    lgaName: nullableString,
    stateName: nullableString,
    documentUrl: nullableString,
    addressVerificationStatus: nullableString,
    addressVerificationIsVague: z.boolean().nullish(),
    verifiedAt: timestamp,
    rejectionReason: nullableString,
  }),
  level3: z.object({
    status,
    submitted: z.boolean().catch(false),
    governmentIdType: nullableString,
    governmentIdNumberLast4: last4,
    frontUrl: nullableString,
    backUrl: nullableString,
    expiryDate: nullableString,
    governmentIdDocumentStatus: nullableString,
    governmentIdVerifiedName: nullableString,
    livenessCheckPassed: z.boolean().catch(false),
    faceMatchScore: z.number().nullish(),
    verifiedAt: timestamp,
    rejectionReason: nullableString,
  }),
  lastReviewAt: timestamp,
  lastReviewedBy: nullableString,
  updatedAt: timestamp,
});
export type KycProfile = z.output<typeof kycProfileSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The list endpoint names identifier fields differently; map them onto the allowlist before parsing.
const listItemSchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const level1 = isRecord(raw.level1) ? raw.level1 : {};
  const level3 = isRecord(raw.level3) ? raw.level3 : {};
  return {
    ...raw,
    level1: {
      ...level1,
      identityNumberLast4: level1.identityNumber,
      bvnLast4: level1.bvn,
      ninLast4: level1.nin,
    },
    level3: { ...level3, governmentIdNumberLast4: level3.governmentIdNumber },
  };
}, kycProfileSchema);

export interface KycQueueQuery {
  filter: KycFilter;
  page: number;
  pageSize: number;
  /** Matches customer email, first and last name and username. */
  search?: string;
}

/** Server-paginated, most recently updated first. Identifiers arrive masked. */
export function fetchKycQueue(query: KycQueueQuery, signal?: AbortSignal) {
  return adminApi.get(`${base}/list`, {
    query: {
      filter: query.filter,
      page: query.page,
      limit: query.pageSize,
      search: query.search?.trim() || undefined,
    },
    schema: z
      .object({ data: z.array(listItemSchema), total: z.number() })
      .transform((v) => ({ rows: v.data, total: v.total })),
    signal,
  });
}

/**
 * Both decisions require `kyc.review` AND a fresh authenticator code. A level
 * change moves the customer's daily withdrawal ceiling — level 3 raises it to
 * ₦50M — so elevating an account is one of the most valuable things a stolen
 * console session could do, and it moves no money at the moment it happens,
 * which is what makes it easy to miss.
 */
export function approveKycLevel(userId: string, level: KycLevel, twoFACode: string) {
  return adminApi.post(`${base}/verify/${encodeURIComponent(userId)}/${level}`, { twoFACode });
}

export function rejectKycLevel(userId: string, level: KycLevel, reason: string, twoFACode: string) {
  return adminApi.post(`${base}/reject/${encodeURIComponent(userId)}/${level}`, {
    reason,
    twoFACode,
  });
}

/* ─── Documents ──────────────────────────────────────────────────────────── */

const PRIVATE_PREFIX = "private:";

/**
 * Resolves a stored document location to something the browser can load:
 * legacy public URLs are used as-is; `private:` keys get a 5-minute signed URL.
 */
export async function resolveDocumentUrl(location: string): Promise<string> {
  if (!location.startsWith(PRIVATE_PREFIX)) return location;
  const key = location.slice(PRIVATE_PREFIX.length);
  const { url } = await adminApi.get("/files/private/admin-sign", {
    query: { key },
    schema: z.object({ url: z.string().startsWith("/files/private/") }),
  });
  return new URL(url, env.NEXT_PUBLIC_API_URL).toString();
}

/** Maps a raw `kyc_profiles` entity onto the allowlisted shape used by the queue. */
function entityToProfile(raw: Record<string, unknown>) {
  return {
    ...raw,
    level1: {
      status: raw.level1Status,
      identityType: raw.identityType,
      identityNumberLast4: raw.identityNumber,
      bvnLast4: raw.bvn,
      ninLast4: raw.nin,
      verifiedAt: raw.level1VerifiedAt,
      verifiedFirstName: raw.verifiedFirstName,
      verifiedMiddleName: raw.verifiedMiddleName,
      verifiedLastName: raw.verifiedLastName,
      verifiedGender: raw.verifiedGender,
      verifiedBirthdate: raw.verifiedBirthdate,
      verifiedPhotoUrl: raw.verifiedPhotoUrl,
      nameMismatch: raw.nameMismatch,
    },
    level2: {
      status: raw.level2Status,
      submitted: Boolean(raw.proofOfAddressDocumentUrl || raw.residentialAddress),
      submittedAt: raw.level2SubmittedAt,
      proofOfAddressType: raw.proofOfAddressType,
      residentialAddress: raw.residentialAddress,
      city: raw.city,
      lgaName: raw.lgaName,
      stateName: raw.stateName,
      documentUrl: raw.proofOfAddressDocumentUrl,
      addressVerificationStatus: raw.addressVerificationStatus,
      addressVerificationIsVague: raw.addressVerificationIsVague,
      verifiedAt: raw.level2VerifiedAt,
      rejectionReason: raw.level2RejectionReason,
    },
    level3: {
      status: raw.level3Status,
      submitted: Boolean(raw.governmentIdFrontUrl),
      governmentIdType: raw.governmentIdType,
      governmentIdNumberLast4: raw.governmentIdNumber,
      frontUrl: raw.governmentIdFrontUrl,
      backUrl: raw.governmentIdBackUrl,
      expiryDate: raw.governmentIdExpiryDate,
      governmentIdDocumentStatus: raw.governmentIdDocumentStatus,
      governmentIdVerifiedName: raw.governmentIdVerifiedName,
      livenessCheckPassed: raw.livenessCheckPassed,
      faceMatchScore: raw.faceMatchScore == null ? null : Number(raw.faceMatchScore),
      verifiedAt: raw.level3VerifiedAt,
      rejectionReason: raw.level3RejectionReason,
    },
  };
}

const userKycSchema = z
  .object({
    data: z.object({
      raw: z
        .preprocess((raw) => (isRecord(raw) ? entityToProfile(raw) : raw), kycProfileSchema)
        .nullable()
        .catch(null),
      dailySpent: decimal,
      remainingDailyLimit: decimal,
    }),
  })
  .transform(({ data }) => ({
    profile: data.raw,
    dailySpent: data.dailySpent,
    remainingDailyLimit: data.remainingDailyLimit,
  }));

/** A single customer's KYC profile plus today's spend against their limit. */
export function fetchUserKyc(userId: string, signal?: AbortSignal) {
  return adminApi.get(`${base}/user/${encodeURIComponent(userId)}`, {
    schema: userKycSchema,
    signal,
  });
}
