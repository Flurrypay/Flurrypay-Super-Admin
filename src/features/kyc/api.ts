import { z } from "zod";

import { env } from "@/env";
import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const base = adminPaths.kyc;

export const KYC_STATUSES = ["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_FILTERS = [
  "ready",
  "action_required",
  "legacy",
  "pending",
  "verified",
  "rejected",
  "all",
] as const;
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
export const kycQueueSummarySchema = z.object({
  all: z.number(),
  ready: z.number(),
  actionRequired: z.number(),
  legacy: z.number(),
});
export type KycQueueSummary = z.infer<typeof kycQueueSummarySchema>;
const reviewSchema = z
  .object({
    category: z.enum(["READY", "LEGACY", "CUSTOMER_ACTION", "COMPLETED", "NOT_STARTED"]),
    legacySubmission: z.boolean(),
    retainedAddressDocument: z.boolean(),
    missingSteps: z.array(z.string()),
    canApprove: z.boolean(),
  })
  .nullish();

export const kycProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  review: reviewSchema,
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
    providerVerified: z.boolean().catch(false),
    bvnVerifiedAt: timestamp,
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
    ninLast4: last4,
    ninVerifiedAt: timestamp,
    verifiedPhotoUrl: nullableString,
    identityMatched: z.boolean().catch(false),
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
    canApprove: z.boolean().catch(false),
    proofOfAddressType: nullableString,
    residentialAddress: nullableString,
    documentUrl: nullableString,
    livenessUrl: nullableString,
    livenessVerifiedAt: timestamp,
    livenessProvider: nullableString,
    livenessScore: z.number().nullish(),
    identityReference: nullableString,
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
  const level2 = isRecord(raw.level2) ? raw.level2 : {};
  const level3 = isRecord(raw.level3) ? raw.level3 : {};
  return {
    ...raw,
    level1: {
      ...level1,
      identityNumberLast4: level1.identityNumber,
      bvnLast4: level1.bvn,
      ninLast4: level1.nin,
    },
    level2: { ...level2, ninLast4: level2.nin },
    level3: { ...level3, governmentIdNumberLast4: level3.governmentIdNumber },
  };
}, kycProfileSchema);

export interface KycQueueQuery {
  filter: KycFilter;
  summaryOnly?: boolean;
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
      summaryOnly: query.summaryOnly || undefined,
      page: query.page,
      limit: query.pageSize,
      search: query.search?.trim() || undefined,
    },
    schema: z
      .object({
        data: z.array(listItemSchema),
        total: z.number(),
        summary: kycQueueSummarySchema.nullish(),
      })
      .transform((v) => ({ rows: v.data, total: v.total, summary: v.summary })),
    signal,
  });
}

/**
 * Both decisions require `kyc.review` AND a fresh authenticator code. A level
 * change moves the customer's daily withdrawal ceiling, so elevating an account is one of the most valuable things a stolen
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
  if (!location.startsWith(PRIVATE_PREFIX) && !location.startsWith("private/")) return location;
  const key = location.startsWith(PRIVATE_PREFIX)
    ? location.slice(PRIVATE_PREFIX.length)
    : location;
  const { url } = await adminApi.get("/files/private/admin-sign", {
    query: { key },
    schema: z.object({ url: z.string().startsWith("/files/private/") }),
  });
  return new URL(url, env.NEXT_PUBLIC_API_URL).toString();
}

function tokenizeName(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function nameTokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let diffs = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      diffs++;
      if (diffs > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return diffs + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Returns true when the customer's account name tokens match the verified
 * registry name tokens (including middle names and transposed name order,
 * e.g. "Sanusi Vincent" vs "SANUSI VINCENT YEKINI").
 */
export function doesRegistryNameMatchAccount(accountName: string, registryName: string): boolean {
  const accountTokens = tokenizeName(accountName);
  const registryTokens = tokenizeName(registryName);
  if (accountTokens.length === 0 || registryTokens.length === 0) return true;

  const matchedAccountTokens = accountTokens.filter((acc) =>
    registryTokens.some((reg) => nameTokensMatch(acc, reg)),
  );
  if (matchedAccountTokens.length === accountTokens.length) return true;
  if (matchedAccountTokens.length >= 2) return true;

  const matchedRegistryTokens = registryTokens.filter((reg) =>
    accountTokens.some((acc) => nameTokensMatch(acc, reg)),
  );
  return matchedRegistryTokens.length === registryTokens.length;
}

/** Maps a raw `kyc_profiles` entity onto the allowlisted shape used by the queue. */
export function entityToProfile(raw: Record<string, unknown>) {
  const evidence = isRecord(raw.identityVerificationEvidence)
    ? raw.identityVerificationEvidence
    : {};
  const bvnEvidence = isRecord(evidence.bvn) ? evidence.bvn : {};
  const ninEvidence = isRecord(evidence.nin) ? evidence.nin : {};
  const biometric = isRecord(evidence.biometric) ? evidence.biometric : {};
  const idType = typeof raw.identityType === "string" ? raw.identityType.toUpperCase() : "";
  const resolvedBvn =
    raw.bvn ?? (idType === "BVN" ? raw.identityNumber : null) ?? bvnEvidence.number ?? null;
  const resolvedNin =
    raw.nin ?? (idType === "NIN" ? raw.identityNumber : null) ?? ninEvidence.number ?? null;
  const currentLevel = typeof raw.currentLevel === "number" ? raw.currentLevel : 0;
  const hasRegistryRecord = Boolean(
    raw.verifiedFirstName ||
    raw.verifiedLastName ||
    raw.bvnVerifiedAt ||
    raw.level1VerifiedAt ||
    resolvedBvn ||
    resolvedNin ||
    raw.identityNumber,
  );
  const level1Verified =
    raw.level1Status === "VERIFIED" || (currentLevel >= 1 && hasRegistryRecord);
  const level2Verified = raw.level2Status === "VERIFIED" || currentLevel >= 2;
  const strictLinked = Boolean(
    raw.level1Status === "VERIFIED" &&
    raw.level2Status === "VERIFIED" &&
    raw.bvn &&
    raw.nin &&
    bvnEvidence.number === raw.bvn &&
    ninEvidence.number === raw.nin &&
    ninEvidence.matchedBvn === raw.bvn,
  );
  const linked =
    strictLinked ||
    Boolean(
      level1Verified &&
      level2Verified &&
      (resolvedNin || resolvedBvn || raw.level2VerifiedAt || raw.ninVerifiedAt),
    );
  const live = Boolean(
    strictLinked &&
    biometric.sessionId &&
    biometric.provider === "AWS_REKOGNITION" &&
    typeof biometric.livenessScore === "number" &&
    biometric.livenessScore >= 90 &&
    typeof biometric.faceScore === "number" &&
    biometric.faceScore >= 80 &&
    biometric.nin === raw.nin &&
    biometric.bvn === raw.bvn &&
    raw.livenessCheckPassed &&
    raw.faceMatchVerifiedAt &&
    raw.livenessCheckUrl,
  );
  const userObj = isRecord(raw.user) ? raw.user : null;
  const accountName = userObj
    ? [userObj.firstName, userObj.lastName].filter(Boolean).join(" ")
    : "";
  const registryName = [raw.verifiedFirstName, raw.verifiedMiddleName, raw.verifiedLastName]
    .filter(Boolean)
    .join(" ");
  const hasNameMismatch =
    Boolean(raw.nameMismatch) &&
    registryName.length > 0 &&
    (!accountName || !doesRegistryNameMatchAccount(accountName, registryName));

  return {
    ...raw,
    level1: {
      status: level1Verified ? "VERIFIED" : raw.level1Status,
      providerVerified: level1Verified && hasRegistryRecord,
      bvnVerifiedAt: raw.bvnVerifiedAt ?? raw.level1VerifiedAt,
      identityType: raw.identityType,
      identityNumberLast4: raw.identityNumber,
      bvnLast4: resolvedBvn,
      ninLast4: resolvedNin,
      verifiedAt: raw.level1VerifiedAt ?? raw.bvnVerifiedAt,
      verifiedFirstName: raw.verifiedFirstName,
      verifiedMiddleName: raw.verifiedMiddleName,
      verifiedLastName: raw.verifiedLastName,
      verifiedGender: raw.verifiedGender,
      verifiedBirthdate: raw.verifiedBirthdate,
      verifiedPhotoUrl: raw.verifiedPhotoUrl,
      nameMismatch: hasNameMismatch,
    },
    level2: {
      status: level2Verified ? "VERIFIED" : raw.level2Status,
      submitted: Boolean(resolvedNin || raw.level2SubmittedAt || level2Verified),
      ninLast4: resolvedNin,
      ninVerifiedAt: raw.ninVerifiedAt ?? raw.level2VerifiedAt,
      verifiedPhotoUrl: ninEvidence.photo,
      identityMatched: linked,
      submittedAt: raw.level2SubmittedAt,
      proofOfAddressType: raw.proofOfAddressType,
      residentialAddress: raw.residentialAddress,
      city: raw.city,
      lgaName: raw.lgaName,
      stateName: raw.stateName,
      documentUrl: raw.proofOfAddressDocumentUrl,
      addressVerificationStatus: raw.addressVerificationStatus,
      addressVerificationIsVague: raw.addressVerificationIsVague,
      verifiedAt: raw.level2VerifiedAt ?? raw.ninVerifiedAt,
      rejectionReason: raw.level2RejectionReason,
    },
    level3: {
      status: raw.level3Status,
      submitted: Boolean(raw.proofOfAddressDocumentUrl || raw.livenessCheckUrl),
      canApprove:
        live &&
        raw.level1Status === "VERIFIED" &&
        raw.level2Status === "VERIFIED" &&
        raw.level3Status === "PENDING" &&
        Boolean(raw.proofOfAddressDocumentUrl && raw.residentialAddress),
      proofOfAddressType: raw.proofOfAddressType,
      residentialAddress: raw.residentialAddress,
      documentUrl: raw.proofOfAddressDocumentUrl,
      livenessUrl: raw.livenessCheckUrl,
      livenessVerifiedAt: raw.faceMatchVerifiedAt,
      livenessProvider: biometric.provider,
      livenessScore: biometric.livenessScore,
      identityReference: live ? "VERIFIED_NIN" : null,
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
