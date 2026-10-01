/**
 * PREVIEW-ONLY sample data. Used when NEXT_PUBLIC_PREVIEW_MODE is on so the
 * console can be explored without the FlurryPay API. Every record is
 * synthetic (example.com addresses, made-up names and references) and shaped
 * like the API's real responses so the same parsing and screens are exercised.
 * Never imported by code paths that run against the real API.
 */

/* ─── Deterministic randomness ───────────────────────────────────────────── */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260923);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const between = (min: number, max: number) => min + rand() * (max - min);
const int = (min: number, max: number) => Math.floor(between(min, max + 1));
const hex = (length: number) =>
  Array.from({ length }, () => Math.floor(rand() * 16).toString(16)).join("");
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

/* ─── People ─────────────────────────────────────────────────────────────── */

const FIRST = [
  "Adaeze",
  "Tunde",
  "Chioma",
  "Ibrahim",
  "Funmi",
  "Emeka",
  "Zainab",
  "Kelechi",
  "Bola",
  "Musa",
  "Ngozi",
  "Segun",
  "Amaka",
  "Yusuf",
  "Temi",
  "Obinna",
  "Halima",
  "Dayo",
  "Ifeoma",
  "Sani",
  "Kemi",
  "Uche",
  "Hauwa",
  "Femi",
];
const LAST = [
  "Okafor",
  "Adeyemi",
  "Bello",
  "Nwosu",
  "Ogunleye",
  "Eze",
  "Abubakar",
  "Okonkwo",
  "Balogun",
  "Danjuma",
  "Umeh",
  "Adebayo",
  "Lawal",
  "Obi",
  "Salami",
  "Chukwu",
];
const BANKS = [
  "Access Bank",
  "GTBank",
  "Zenith Bank",
  "First Bank",
  "UBA",
  "Kuda",
  "Opay",
  "Moniepoint",
];

export interface PreviewUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userName: string;
  phoneNumber: string;
  isConfirmed: boolean;
  isBlocked: boolean;
  isSuspended: boolean;
  outboundRestricted: boolean;
  loginLockedUntil: string | null;
  pinLockedUntil: string | null;
  loginAttempts: number;
  pinAttempts: number;
  hasVerifiedBVN: boolean;
  hasVerifiedNIN: boolean;
  hasVerifiedAddress: boolean;
  hasVerifiedGovernmentId: string | null;
  level: number;
  walletBalance: string;
  referralBalance: string;
  welcomeBonus: string;
  lastLogin: string | null;
  createdAt: string;
  suspensionReason: string | null;
  suspendedAt: string | null;
  outboundRestrictedReason: string | null;
  outboundRestrictedAt: string | null;
  reasonForBlock: string | null;
  blockedAt: string | null;
}

export const users: PreviewUser[] = Array.from({ length: 48 }, (_, i) => {
  const firstName = FIRST[i % FIRST.length] as string;
  const lastName = pick(LAST);
  const level = pick([0, 1, 1, 1, 2, 2, 3]);
  const created = between(1, 180) * DAY;
  return {
    id: uuid(),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
    firstName,
    lastName,
    userName: `${firstName.toLowerCase()}${i}`,
    phoneNumber: `+23480${int(10_000_000, 99_999_999)}`,
    isConfirmed: rand() > 0.06,
    isBlocked: i === 7,
    isSuspended: i === 11 || i === 23,
    outboundRestricted: i === 5 || i === 31,
    loginLockedUntil: i === 17 ? new Date(NOW + 2 * HOUR).toISOString() : null,
    pinLockedUntil: null,
    loginAttempts: i === 17 ? 5 : 0,
    pinAttempts: 0,
    hasVerifiedBVN: level >= 1,
    hasVerifiedNIN: level >= 1 && rand() > 0.4,
    hasVerifiedAddress: level >= 2,
    hasVerifiedGovernmentId: level >= 3 ? "PASSPORT" : null,
    level,
    walletBalance: between(0, 850_000).toFixed(2),
    referralBalance: (rand() > 0.7 ? between(500, 15_000) : 0).toFixed(2),
    welcomeBonus: "0.00",
    lastLogin: rand() > 0.1 ? ago(between(0.1, 20) * DAY) : null,
    createdAt: ago(created),
    suspensionReason: i === 11 || i === 23 ? "Chargeback dispute under review" : null,
    suspendedAt: i === 11 || i === 23 ? ago(3 * DAY) : null,
    outboundRestrictedReason: i === 5 || i === 31 ? "Unusual withdrawal pattern" : null,
    outboundRestrictedAt: i === 5 || i === 31 ? ago(2 * DAY) : null,
    reasonForBlock: i === 7 ? "blocked_by_admin" : null,
    blockedAt: i === 7 ? ago(9 * DAY) : null,
  };
});

export const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`;

/* ─── Transactions ───────────────────────────────────────────────────────── */

const TYPES = [
  ["FIAT_DEPOSIT", 5],
  ["FIAT_WITHDRAWAL", 5],
  ["CRYPTO_BUY", 4],
  ["CRYPTO_SELL", 3],
  ["CRYPTO_SWAP", 2],
  ["CRYPTO_SEND", 2],
  ["CRYPTO_RECEIVE", 2],
  ["AIRTIME_PURCHASE", 3],
  ["DATA_PURCHASE", 2],
  ["ELECTRICITY_BILL", 1],
  ["CABLE_SUBSCRIPTION", 1],
] as const;
const WEIGHTED_TYPES = TYPES.flatMap(([type, weight]) => Array<string>(weight).fill(type));
const COINS = [
  { ticker: "BTC", network: "bitcoin", rate: 150_000_000 },
  { ticker: "ETH", network: "ethereum", rate: 5_200_000 },
  { ticker: "USDT", network: "tron", rate: 1_550 },
  { ticker: "SOL", network: "solana", rate: 240_000 },
] as const;

export interface PreviewTransaction {
  id: string;
  userId: string;
  transactionType: string;
  status: string;
  title: string | null;
  description: string | null;
  amount: string;
  currency: string;
  currencyType: "FIAT" | "CRYPTO";
  fee: string;
  feeCurrency: string;
  reference: string;
  externalId: string | null;
  provider: string | null;
  network: string | null;
  transactionHash: string | null;
  walletAddress: string | null;
  phoneNumber: string | null;
  failureReason: string | null;
  failureOurFault: boolean | null;
  reversedAt: string | null;
  reversedAmount: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; firstName: string; lastName: string };
}

function statusFor(): string {
  const r = rand();
  if (r < 0.8) return "COMPLETED";
  if (r < 0.88) return "FAILED";
  if (r < 0.93) return "PENDING";
  if (r < 0.97) return "PROCESSING";
  if (r < 0.99) return "REVERSED";
  return "CANCELLED";
}

const FAILURES = [
  "Beneficiary bank unavailable",
  "Insufficient liquidity at provider",
  "Invalid account number",
  "Provider timeout",
  "Network congestion",
];

export const transactions: PreviewTransaction[] = Array.from({ length: 420 }, (_, i) => {
  const user = pick(users);
  const type = pick(WEIGHTED_TYPES);
  const status = statusFor();
  const created = NOW - between(0.02, 45) * DAY;
  const crypto = type.startsWith("CRYPTO");
  const coin = pick(COINS);
  const naira =
    type === "AIRTIME_PURCHASE" || type === "DATA_PURCHASE"
      ? pick([500, 1000, 2000, 5000])
      : Math.round(between(2_000, 650_000) / 50) * 50;
  const amount = crypto ? (naira / coin.rate).toFixed(8) : naira.toFixed(2);
  return {
    id: uuid(),
    userId: user.id,
    transactionType: type,
    status,
    title: null,
    description: null,
    amount,
    currency: crypto ? coin.ticker : "NGN",
    currencyType: crypto ? ("CRYPTO" as const) : ("FIAT" as const),
    fee: crypto
      ? (Number(amount) * 0.005).toFixed(8)
      : type === "FIAT_WITHDRAWAL"
        ? "50.00"
        : "0.00",
    feeCurrency: crypto ? coin.ticker : "NGN",
    reference: `FP-${(100_000 + i).toString(36).toUpperCase()}-${hex(4).toUpperCase()}`,
    externalId: rand() > 0.3 ? `PRV${hex(10).toUpperCase()}` : null,
    provider: crypto ? "quidax" : type.includes("FIAT") ? "nomba" : "vtpass",
    network: crypto ? coin.network : null,
    transactionHash: crypto && status === "COMPLETED" ? `0x${hex(40)}` : null,
    walletAddress: crypto ? `${coin.ticker === "BTC" ? "bc1q" : "0x"}${hex(32)}` : null,
    phoneNumber: type === "AIRTIME_PURCHASE" || type === "DATA_PURCHASE" ? user.phoneNumber : null,
    failureReason: status === "FAILED" ? pick(FAILURES) : null,
    failureOurFault: status === "FAILED" ? rand() > 0.6 : null,
    reversedAt: status === "REVERSED" ? new Date(created + 2 * HOUR).toISOString() : null,
    reversedAmount: status === "REVERSED" ? amount : null,
    createdAt: new Date(created).toISOString(),
    updatedAt: new Date(created + between(1, 600) * 1000).toISOString(),
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  };
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/* ─── KYC ────────────────────────────────────────────────────────────────── */

export interface PreviewKyc {
  id: string;
  userId: string;
  level1Status: string;
  level2Status: string;
  level3Status: string;
  updatedAt: string;
  level2SubmittedAt: string | null;
  level2RejectionReason: string | null;
  level3RejectionReason: string | null;
}

export const kycProfiles: PreviewKyc[] = users.map((u, i) => {
  const l2Pending = i % 6 === 2;
  const l3Pending = i % 9 === 4;
  return {
    id: uuid(),
    userId: u.id,
    level1Status: u.level >= 1 ? "VERIFIED" : i % 5 === 0 ? "PENDING" : "NOT_STARTED",
    level2Status: l2Pending
      ? "PENDING"
      : u.level >= 2
        ? "VERIFIED"
        : i % 13 === 0
          ? "REJECTED"
          : "NOT_STARTED",
    level3Status: l3Pending ? "PENDING" : u.level >= 3 ? "VERIFIED" : "NOT_STARTED",
    updatedAt: ago(between(0.1, 30) * DAY),
    level2SubmittedAt: l2Pending ? ago(between(0.2, 4) * DAY) : null,
    level2RejectionReason:
      i % 13 === 0 && !l2Pending && u.level < 2 ? "Document is older than 3 months" : null,
    level3RejectionReason: null,
  };
});

export function kycEntity(k: PreviewKyc) {
  const u = users.find((x) => x.id === k.userId);
  return {
    id: k.id,
    userId: k.userId,
    user: u
      ? { firstName: u.firstName, lastName: u.lastName, email: u.email, userName: u.userName }
      : null,
    currentLevel: u?.level ?? 0,
    dailyWithdrawalLimit: ["50000.00", "200000.00", "1000000.00", "5000000.00"][u?.level ?? 0],
    isKYCCompleted: (u?.level ?? 0) >= 3,
    level1Status: k.level1Status,
    identityType: "BVN",
    identityNumber: `*******${int(1000, 9999)}`,
    bvn: `*******${int(1000, 9999)}`,
    nin: null,
    level1VerifiedAt: k.level1Status === "VERIFIED" ? k.updatedAt : null,
    verifiedFirstName: u?.firstName,
    verifiedLastName: u?.lastName,
    verifiedGender: null,
    verifiedBirthdate: null,
    verifiedPhotoUrl: null,
    nameMismatch: false,
    level2Status: k.level2Status,
    level2SubmittedAt: k.level2SubmittedAt,
    proofOfAddressType: k.level2Status === "NOT_STARTED" ? null : "UTILITY_BILL",
    residentialAddress: k.level2Status === "NOT_STARTED" ? null : `${int(1, 120)} Allen Avenue`,
    city: k.level2Status === "NOT_STARTED" ? null : "Ikeja",
    lgaName: k.level2Status === "NOT_STARTED" ? null : "Ikeja",
    stateName: k.level2Status === "NOT_STARTED" ? null : "Lagos",
    proofOfAddressDocumentUrl: null,
    addressVerificationStatus: null,
    level2VerifiedAt: k.level2Status === "VERIFIED" ? k.updatedAt : null,
    level2RejectionReason: k.level2RejectionReason,
    level3Status: k.level3Status,
    governmentIdType: k.level3Status === "NOT_STARTED" ? null : "PASSPORT",
    governmentIdNumber: k.level3Status === "NOT_STARTED" ? null : `A****${int(1000, 9999)}`,
    governmentIdFrontUrl: null,
    livenessCheckPassed: k.level3Status !== "NOT_STARTED",
    faceMatchScore: k.level3Status === "NOT_STARTED" ? null : Number(between(82, 99).toFixed(1)),
    level3VerifiedAt: k.level3Status === "VERIFIED" ? k.updatedAt : null,
    level3RejectionReason: k.level3RejectionReason,
    updatedAt: k.updatedAt,
  };
}

/* ─── Administrators, roles, audit ───────────────────────────────────────── */

export const PREVIEW_ADMIN_ID = "00000000-0000-4000-a000-000000000001";

export const roles = [
  {
    id: uuid(),
    name: "Customer support",
    description: "Tier 1 support: look up customers and transactions.",
    permissions: ["users.view", "transactions.view"],
    createdAt: ago(40 * DAY),
    updatedAt: ago(12 * DAY),
  },
  {
    id: uuid(),
    name: "Compliance analyst",
    description: "Alerts, reports and KYC review.",
    permissions: ["users.view", "kyc.review", "compliance.review", "auditLogs.view"],
    createdAt: ago(30 * DAY),
    updatedAt: ago(30 * DAY),
  },
];

export const admins = [
  {
    id: PREVIEW_ADMIN_ID,
    email: "preview.admin@example.com",
    userName: "preview",
    firstName: "Preview",
    lastName: "Admin",
    role: "superAdmin",
    permissions: [] as string[],
    customRoleId: null as string | null,
    isConfirmed: true,
    isSuspended: false,
    suspensionReason: null as string | null,
    suspendedAt: null as string | null,
    mustResetPassword: false,
    invitationExpiresAt: null as string | null,
    hasActivated2FA: true,
    phoneNumber: "+234801•••678",
    trustedDeviceCount: 1,
    hasActiveSession: true,
    lastLoginAt: ago(0.02 * DAY),
    createdAt: ago(200 * DAY),
  },
  {
    id: uuid(),
    email: "support.lead@example.com",
    userName: "supportlead",
    firstName: "Kemi",
    lastName: "Adebayo",
    role: "admin",
    permissions: roles[0]?.permissions ?? [],
    customRoleId: roles[0]?.id ?? null,
    isConfirmed: true,
    isSuspended: false,
    suspensionReason: null,
    suspendedAt: null,
    mustResetPassword: false,
    invitationExpiresAt: null,
    hasActivated2FA: true,
    phoneNumber: "+234803•••120",
    trustedDeviceCount: 1,
    hasActiveSession: false,
    lastLoginAt: ago(1.3 * DAY),
    createdAt: ago(90 * DAY),
  },
  {
    id: uuid(),
    email: "compliance@example.com",
    userName: "mlro",
    firstName: "Ibrahim",
    lastName: "Lawal",
    role: "admin",
    permissions: roles[1]?.permissions ?? [],
    customRoleId: roles[1]?.id ?? null,
    isConfirmed: true,
    isSuspended: false,
    suspensionReason: null,
    suspendedAt: null,
    mustResetPassword: false,
    invitationExpiresAt: null,
    hasActivated2FA: true,
    phoneNumber: "+234805•••441",
    trustedDeviceCount: 1,
    hasActiveSession: true,
    lastLoginAt: ago(0.2 * DAY),
    createdAt: ago(60 * DAY),
  },
  {
    id: uuid(),
    email: "finance.ops@example.com",
    userName: "finops",
    firstName: "Chioma",
    lastName: "Eze",
    role: "executive",
    permissions: ["treasury.view", "transactions.view", "settings.manage"],
    customRoleId: null,
    isConfirmed: true,
    isSuspended: true,
    suspensionReason: "On extended leave",
    suspendedAt: ago(6 * DAY),
    mustResetPassword: false,
    invitationExpiresAt: null,
    hasActivated2FA: true,
    phoneNumber: null,
    trustedDeviceCount: 0,
    hasActiveSession: false,
    lastLoginAt: ago(20 * DAY),
    createdAt: ago(120 * DAY),
  },
  {
    id: uuid(),
    email: "new.hire@example.com",
    userName: "newhire",
    firstName: "Tunde",
    lastName: "Ogunleye",
    role: "admin",
    permissions: roles[0]?.permissions ?? [],
    customRoleId: roles[0]?.id ?? null,
    isConfirmed: true,
    isSuspended: false,
    suspensionReason: null,
    suspendedAt: null,
    mustResetPassword: true,
    invitationExpiresAt: new Date(NOW + 50 * HOUR).toISOString(),
    hasActivated2FA: false,
    phoneNumber: null,
    trustedDeviceCount: 0,
    hasActiveSession: false,
    lastLoginAt: null,
    createdAt: ago(22 * HOUR),
  },
];

const ADMIN_ACTIONS: [string, (u: PreviewUser) => Record<string, unknown>, string | null][] = [
  ["ADMIN_LOGIN", () => ({}), null],
  [
    "USER_ACCOUNT_SUSPENDED",
    (u) => ({ targetUserId: u.id, reason: "Chargeback dispute under review" }),
    "user",
  ],
  [
    "USER_ACCOUNT_FROZEN",
    (u) => ({ targetUserId: u.id, reason: "Unusual withdrawal pattern" }),
    "user",
  ],
  ["KYC_APPROVED", (u) => ({ userId: u.id, level: 2 }), "user"],
  [
    "KYC_REJECTED",
    (u) => ({ userId: u.id, level: 2, reason: "Document is older than 3 months" }),
    "user",
  ],
  ["KYC_PROFILE_VIEWED", (u) => ({ userId: u.id }), "user"],
  ["DATA_EXPORTED", () => ({ dataset: "transactions", format: "csv", rowCount: 412 }), null],
  ["USER_STATEMENT_DOWNLOADED", (u) => ({ targetUserId: u.id, format: "csv" }), "user"],
  [
    "COMPLIANCE_ALERT_DISPOSITIONED",
    (u) => ({ subjectUserId: u.id, newStatus: "CLEARED" }),
    "user",
  ],
];

export const auditLogs = Array.from({ length: 160 }, (_, i) => {
  const admin = pick(admins.slice(0, 3));
  const [action, meta, targetType] = pick(ADMIN_ACTIONS);
  const user = pick(users);
  const metadata = meta(user);
  return {
    id: uuid(),
    adminId: admin.id,
    adminEmail: admin.email,
    action,
    metadata,
    ipAddress: `102.89.${int(1, 250)}.${int(1, 250)}`,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/128.0",
    targetType: targetType,
    targetId: targetType ? user.id : action === "DATA_EXPORTED" ? "transactions" : null,
    reason: typeof metadata.reason === "string" ? metadata.reason : null,
    requestId: `req_${hex(16)}`,
    before: action === "USER_ACCOUNT_SUSPENDED" ? { isSuspended: false } : null,
    after: action === "USER_ACCOUNT_SUSPENDED" ? { isSuspended: true } : null,
    createdAt: ago(i * 0.28 * DAY + between(0, 0.2) * DAY),
  };
});

/* ─── Operations ─────────────────────────────────────────────────────────── */

export const strandedTransfers = transactions
  .filter((t) => t.transactionType === "FIAT_WITHDRAWAL" && t.status === "PROCESSING")
  .slice(0, 5)
  .map((t) => {
    const u = users.find((x) => x.id === t.userId);
    return {
      reference: t.reference,
      transactionType: t.transactionType,
      status: t.status,
      userId: t.userId,
      email: u?.email ?? null,
      fullName: u ? fullName(u) : "",
      phoneNumber: u?.phoneNumber ?? null,
      amountNaira: Number(t.amount),
      feeAlreadyRefundedNaira: 0,
      owedNaira: Number(t.amount),
      ageHours: Math.floor((NOW - Date.parse(t.createdAt)) / HOUR),
      createdAt: t.createdAt,
      externalId: t.externalId,
      stage: "provider_submitted",
      alreadyRefunded: false,
      bankName: pick(BANKS),
      accountNumber: `${int(1_000_000_000, 9_999_999_999)}`,
    };
  });

export const reversalCandidates = transactions
  .filter((t) => t.status === "FAILED" && t.currency === "NGN")
  .slice(0, 6)
  .map((t, i) => ({
    reference: t.reference,
    userid: t.userId,
    type: t.transactionType,
    amount: t.amount,
    currency: t.currency,
    createdat: t.createdAt,
    email: t.user.email,
    firstname: t.user.firstName,
    reversalStatusUnknown: i % 3 === 0,
    note: i % 3 === 0 ? "Failed before refund tracking was introduced" : null,
  }));

/* ─── Compliance and risk ────────────────────────────────────────────────── */

const RULES = [
  "STRUCTURING",
  "VALUE_ABOVE_PROFILE",
  "PASS_THROUGH",
  "SHARED_DEVICE",
  "DORMANT_REACTIVATION",
  "HIGH_RISK_CRYPTO_DESTINATION",
];
const SUMMARIES: Record<string, string> = {
  STRUCTURING: "Several deposits just under the reporting threshold within 48 hours",
  VALUE_ABOVE_PROFILE: "Monthly inflow is well above the customer's declared expected volume",
  PASS_THROUGH: "Funds received and sent out again within an hour",
  SHARED_DEVICE: "Device also used by two other customer accounts",
  DORMANT_REACTIVATION: "Account inactive for months, then large transfers",
  HIGH_RISK_CRYPTO_DESTINATION: "Withdrawal to an address flagged by the screening provider",
};

export const complianceAlerts = Array.from({ length: 14 }, (_, i) => {
  const u = pick(users);
  const rule = pick(RULES);
  const status =
    i < 6
      ? "OPEN"
      : i < 8
        ? "UNDER_REVIEW"
        : i < 11
          ? "CLEARED"
          : i < 13
            ? "ESCALATED"
            : "REPORTED";
  return {
    id: uuid(),
    userId: u.id,
    user: {
      id: u.id,
      email: u.email,
      userName: u.userName,
      firstName: u.firstName,
      lastName: u.lastName,
    },
    rule,
    severity: pick(["CRITICAL", "HIGH", "HIGH", "MEDIUM", "MEDIUM", "LOW"]),
    status,
    summary: SUMMARIES[rule] ?? "",
    evidence: {
      transactionsReviewed: int(3, 20),
      windowHours: 48,
      totalNaira: between(200_000, 3_000_000).toFixed(2),
    },
    reviewedBy: status === "OPEN" ? null : admins[2]?.id,
    reviewedAt: status === "OPEN" ? null : ago(between(0.5, 5) * DAY),
    reviewNote: status === "CLEARED" ? "Salary payments confirmed with payslips" : null,
    reportId: null,
    createdAt: ago(between(0.2, 25) * DAY),
  };
});

export const complianceReports = [
  { status: "INTERNAL_ESCALATION", type: "STR" },
  { status: "PENDING_FILING", type: "STR" },
  { status: "FILED", type: "STR" },
  { status: "NOT_REPORTED", type: "STR" },
].map((r, i) => {
  const u = users[i * 5 + 3] ?? users[0];
  return {
    id: uuid(),
    reference: `STR-2026-${String(i + 1).padStart(4, "0")}`,
    userId: u?.id ?? "",
    user: u
      ? {
          id: u.id,
          email: u.email,
          userName: u.userName,
          firstName: u.firstName,
          lastName: u.lastName,
        }
      : null,
    reportType: r.type,
    status: r.status,
    suspicionGrounds:
      "Repeated round-number deposits from unrelated third parties, withdrawn to crypto within hours, inconsistent with the declared occupation.",
    amountInvolved: between(500_000, 8_000_000).toFixed(2),
    raisedBy: admins[2]?.id ?? null,
    assessedAt: r.status === "INTERNAL_ESCALATION" ? null : ago((10 - i) * DAY),
    assessmentRationale:
      r.status === "NOT_REPORTED"
        ? "Customer supplied invoices that explain the pattern; suspicion not sustained."
        : r.status === "INTERNAL_ESCALATION"
          ? null
          : "Pattern consistent with layering; no plausible explanation provided.",
    filedAt: r.status === "FILED" ? ago(3 * DAY) : null,
    nfiuReference: r.status === "FILED" ? "NFIU-ACK-58213" : null,
    filingNote: null,
    createdAt: ago((14 - i * 2) * DAY),
  };
});

export const riskCases = Array.from({ length: 7 }, (_, i) => {
  const u = pick(users);
  const status =
    ["OPEN", "OPEN", "AWAITING_CUSTOMER", "UNDER_REVIEW", "OPEN", "CLEARED", "CONFIRMED"][i] ??
    "OPEN";
  return {
    id: uuid(),
    reference: `CASE-2026-${String(i + 1).padStart(4, "0")}`,
    userId: u.id,
    status,
    severity: pick(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    trigger: pick([
      "Velocity limit triggered",
      "Frozen by admin from the transactions view",
      "Inflow far above baseline",
    ]),
    description:
      "Large inbound transfers from new counterparties followed by immediate crypto purchases.",
    riskScore: int(55, 97),
    heldAmountNaira: i < 3 ? between(50_000, 400_000).toFixed(2) : null,
    heldTransactionReference: i < 3 ? (transactions[i * 7]?.reference ?? null) : null,
    dueAt: new Date(NOW + (i - 2) * DAY).toISOString(),
    evidenceRequested: status === "AWAITING_CUSTOMER" ? ["source_of_funds", "invoice"] : null,
    evidenceRequestedAt: status === "AWAITING_CUSTOMER" ? ago(DAY) : null,
    evidenceSubmitted: null,
    resolution:
      status === "CLEARED"
        ? "Customer provided a signed sale agreement for the property sale."
        : status === "CONFIRMED"
          ? "Funds traced to a reported scam; account restricted."
          : null,
    resolvedAt: status === "CLEARED" || status === "CONFIRMED" ? ago(2 * DAY) : null,
    createdAt: ago((12 - i) * DAY),
  };
});

export interface PreviewHold {
  id: string;
  userId: string;
  assetType: string;
  currency: string | null;
  amountCrypto: string | null;
  amountNaira: string | null;
  status: string;
  reason: string;
  caseId: string | null;
  transactionReference: string | null;
  createdAt: string;
}

export const fundHolds: PreviewHold[] = riskCases
  .filter((c) => c.heldAmountNaira)
  .map((c) => ({
    id: uuid(),
    userId: c.userId,
    assetType: "NAIRA",
    currency: null,
    amountCrypto: null,
    amountNaira: c.heldAmountNaira,
    status: "ACTIVE",
    reason: "Funds held while we review a recent transfer.",
    caseId: c.id,
    transactionReference: c.heldTransactionReference,
    createdAt: c.createdAt,
  }));

/* ─── Treasury and rates ─────────────────────────────────────────────────── */

export const payoutProviders = [
  {
    id: uuid(),
    provider: "nomba",
    name: "Nomba settlement",
    bankName: "Nomba MFB",
    accountName: "FlurryPay Ltd",
    environment: "live",
    isActive: true,
    isDefault: true,
    cachedBalance: 48_250_300.55,
    lastSyncedAt: ago(0.1 * HOUR),
    hasApiKey: true,
  },
  {
    id: uuid(),
    provider: "falconpay",
    name: "FalconPay",
    bankName: "Providus Bank",
    accountName: "FlurryPay Ltd",
    environment: "live",
    isActive: false,
    isDefault: false,
    cachedBalance: 3_120_000,
    lastSyncedAt: ago(5 * HOUR),
    hasApiKey: true,
  },
];

export const earnings = transactions
  .filter(
    (t) =>
      t.status === "COMPLETED" &&
      ["CRYPTO_BUY", "CRYPTO_SELL", "CRYPTO_SWAP"].includes(t.transactionType),
  )
  .map((t) => {
    const coin = COINS.find((c) => c.ticker === t.currency) ?? COINS[2];
    const naira = Number(t.amount) * coin.rate;
    return {
      id: uuid(),
      transactionType:
        t.transactionType === "CRYPTO_BUY"
          ? "buy"
          : t.transactionType === "CRYPTO_SELL"
            ? "sell"
            : "swap",
      userId: t.userId,
      coin: t.currency,
      cryptoAmount: t.amount,
      nairaAmount: naira.toFixed(2),
      profit: (naira * 0.015).toFixed(2),
      adminRate: 1_550,
      reference: t.reference,
      swapStrategy: t.transactionType === "CRYPTO_SWAP" ? `${t.currency} -> USDT` : null,
      createdAt: t.createdAt,
    };
  });

export const rates = {
  buyRate: 1_585,
  sellRate: 1_530,
  buyMarkupPercent: 1.5,
  sellMarkdownPercent: 1.5,
  swapFeePercent: 0.5,
  commission: 0,
  liveQuidaxRates: {
    usdtNgn: { last: "1552.40", buy: "1553.10", sell: "1551.80", high: "1561.00", low: "1540.25" },
  },
};

export const notifications = [
  {
    id: uuid(),
    title: "Stranded transfers need attention",
    body: "Transfers have been processing for over 24 hours.",
    type: "warning",
    priority: "high",
    targetRole: "all",
    read: false,
    createdAt: ago(2 * HOUR),
  },
  {
    id: uuid(),
    title: "New compliance alert",
    body: "A critical structuring alert was raised.",
    type: "error",
    priority: "high",
    targetRole: "all",
    read: false,
    createdAt: ago(5 * HOUR),
  },
  {
    id: uuid(),
    title: "KYC submissions waiting",
    body: "Level 2 documents are waiting for review.",
    type: "info",
    priority: "medium",
    targetRole: "all",
    read: true,
    createdAt: ago(DAY),
  },
];

export const PREVIEW_NOW = NOW;
