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

/**
 * Index into a generated fixture array.
 *
 * Throws rather than returning undefined: every call site below indexes a list
 * this file built itself, so a miss means the fixture was edited wrongly and the
 * preview should fail loudly at import time instead of rendering a page full of
 * blanks that look like real empty data.
 */
function fixture<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Preview fixture index ${index} is out of range (length ${items.length}).`);
  }
  return value;
}

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
  /**
   * What this transaction did to the customer's naira balance.
   *
   * Null for a transaction that never touched it — which is most crypto
   * movement — so the preview exercises both the populated and the empty case.
   */
  walletMovement: {
    balanceBefore: string;
    balanceAfter: string;
    netChange: string;
    hasGap: boolean;
    entries: {
      id: string;
      direction: "CREDIT" | "DEBIT";
      amountNaira: string;
      balanceBefore: string;
      balanceAfter: string;
      source: string;
      narration: string | null;
      createdAt: string;
    }[];
  } | null;
  /** Admin flag. Internal only — never shown to the customer. */
  flaggedAt: string | null;
  flagReason: string | null;
  flagSeverity: string | null;
  flagNote: string | null;
  flaggedByAdminId: string | null;
  flagClearedAt: string | null;
  flagClearedByAdminId: string | null;
  flagResolution: string | null;
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
    // Filled in below, once every row exists and a running balance per customer
    // can be walked backwards from their current one.
    walletMovement: null as PreviewTransaction["walletMovement"],
    // Admin flags, on a deliberately small minority of rows — around one in
    // forty, which is roughly what a real review queue looks like. A preview
    // where half the ledger is flagged would make the column look like noise
    // rather than the exception it is.
    flaggedAt: null as string | null,
    flagReason: null as string | null,
    flagSeverity: null as string | null,
    flagNote: null as string | null,
    flaggedByAdminId: null as string | null,
    flagClearedAt: null as string | null,
    flagClearedByAdminId: null as string | null,
    flagResolution: null as string | null,
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

/**
 * Walk each customer's naira balance backwards to build the wallet ledger.
 *
 * Backwards, for the same reason the per-customer statement is: the newest
 * entry's `balanceAfter` has to equal the balance shown everywhere else, and
 * the only way to guarantee that is to start from that number. Built forwards
 * from an invented opening balance, every transaction in the preview would
 * contradict the customer's own balance — which is precisely the discrepancy
 * these columns exist to make visible, so faking one would be worse than
 * showing nothing.
 *
 * Only naira transactions get a movement. A crypto-to-crypto send does not
 * touch the wallet, and giving it a fabricated before/after would teach the
 * reader that every transaction has one.
 */
const runningBalance = new Map<string, number>();
for (const tx of transactions) {
  const touchesNaira =
    tx.currencyType === "FIAT" && (tx.status === "COMPLETED" || tx.status === "REVERSED");
  if (!touchesNaira) continue;

  const owner = users.find((u) => u.id === tx.userId);
  if (!owner) continue;

  const after = runningBalance.get(tx.userId) ?? Number(owner.walletBalance);
  const amount = Number(tx.amount);
  const credit = tx.transactionType === "FIAT_DEPOSIT" || tx.transactionType === "WALLET_FUNDING";
  const fee = Number(tx.fee) || 0;
  const before = Math.round((credit ? after - amount : after + amount + fee) * 100) / 100;
  runningBalance.set(tx.userId, before);

  const principalAfter = Math.round((credit ? before + amount : before - amount) * 100) / 100;
  const entries: NonNullable<PreviewTransaction["walletMovement"]>["entries"] = [
    {
      id: `wl-${tx.id}-1`,
      direction: credit ? "CREDIT" : "DEBIT",
      amountNaira: amount.toFixed(2),
      balanceBefore: before.toFixed(2),
      balanceAfter: principalAfter.toFixed(2),
      source: credit ? "DEPOSIT_WEBHOOK" : tx.transactionType,
      narration: credit ? "Bank transfer" : null,
      createdAt: tx.createdAt,
    },
  ];

  // A withdrawal's fee is its own movement under the same reference — the case
  // that makes a single before/after pair insufficient, and the reason the
  // detail panel lists entries rather than summarising them.
  if (!credit && fee > 0) {
    entries.push({
      id: `wl-${tx.id}-2`,
      direction: "DEBIT",
      amountNaira: fee.toFixed(2),
      balanceBefore: principalAfter.toFixed(2),
      balanceAfter: after.toFixed(2),
      source: "TRANSFER_FEE",
      narration: "Transfer fee",
      createdAt: tx.createdAt,
    });
  }

  tx.walletMovement = {
    balanceBefore: before.toFixed(2),
    balanceAfter: after.toFixed(2),
    netChange: (Math.round((after - before) * 100) / 100).toFixed(2),
    hasGap: false,
    entries,
  };
}

/**
 * One deliberately broken chain.
 *
 * A transaction whose entries do not join up means a balance change happened
 * in between that nothing accounts for — the untraceable-loss case the ledger
 * exists to surface. The preview has to show what that looks like, or the
 * warning path is code nobody has ever seen render.
 */
const brokenChain = transactions.find((t) => (t.walletMovement?.entries.length ?? 0) > 1);
if (brokenChain?.walletMovement) {
  const [, second] = brokenChain.walletMovement.entries;
  if (second) {
    second.balanceBefore = (Number(second.balanceBefore) - 7_500).toFixed(2);
    brokenChain.walletMovement.hasGap = true;
  }
}

/**
 * Seed a handful of flags: open ones at a spread of severities, plus one already
 * cleared so the "flagged then checked" history is visible too.
 */
for (const [index, seed] of (
  [
    [
      "SUSPECTED_FRAUD",
      "CRITICAL",
      "Third transfer to the same new beneficiary in an hour, each just under ₦100,000.",
    ],
    [
      "UNUSUAL_PATTERN",
      "HIGH",
      "First transfer this size on an account whose p95 is about ₦12,000.",
    ],
    [
      "CUSTOMER_DISPUTE",
      "MEDIUM",
      "Customer says they did not authorise this and did not receive the airtime.",
    ],
    [
      "POSSIBLE_DUPLICATE",
      "LOW",
      "Same amount, same beneficiary, 40 seconds apart. Probably a double tap.",
    ],
  ] as const
).entries()) {
  const tx = transactions[index * 7 + 3];
  if (!tx) continue;
  tx.flaggedAt = new Date(Date.parse(tx.createdAt) + 30 * 60_000).toISOString();
  tx.flagReason = seed[0];
  tx.flagSeverity = seed[1];
  tx.flagNote = seed[2];
  tx.flaggedByAdminId = PREVIEW_ADMIN_ID;
}

const clearedFlag = transactions[40];
if (clearedFlag) {
  clearedFlag.flaggedAt = ago(6 * DAY);
  clearedFlag.flagReason = "AWAITING_PROOF_OF_FUNDS";
  clearedFlag.flagSeverity = "MEDIUM";
  clearedFlag.flagNote = "Large inbound with no obvious source. Asked the customer for an invoice.";
  clearedFlag.flaggedByAdminId = PREVIEW_ADMIN_ID;
  clearedFlag.flagClearedAt = ago(4 * DAY);
  clearedFlag.flagClearedByAdminId = PREVIEW_ADMIN_ID;
  clearedFlag.flagResolution =
    "Customer produced the invoice and the sender is their registered supplier. No further action.";
}

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
    // Synthetic, but a real shape: this is the number an admin would transfer
    // the float into, which is why the console shows it unmasked.
    accountNumber: "5119947015",
    bankCode: "000030",
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
    accountNumber: "9930014477",
    bankCode: "000023",
    environment: "live",
    isActive: false,
    isDefault: false,
    cachedBalance: 3_120_000,
    lastSyncedAt: ago(5 * HOUR),
    hasApiKey: true,
  },
];

/**
 * The company's own crypto wallets.
 *
 * One reserve is deliberately left unpriced and unavailable: a balance the
 * exchange would not answer for is a real and frequent state, and a preview
 * where every number resolves hides how the table reports it.
 */
export const cryptoReserves = [
  {
    coinName: "Tether",
    coinTicker: "USDT",
    coinBalance: {
      cryptoBalance: "184320.44",
      nairaBalance: "285696682.00",
      lastUpdated: ago(0.05 * HOUR),
    },
    networks: [
      {
        id: "res-usdt-trc20",
        address: "TXq7preview9a3c1f0d2b8e4a6c5d7f9e1b3a5",
        network: "Tron (TRC20)",
        networkId: "trc20",
        withdrawsEnabled: true,
      },
      {
        id: "res-usdt-bep20",
        address: "0xpreview4k7x9m2n8p0q3r5s7t9v1w3x5y7z9a1b3",
        network: "BNB Smart Chain (BEP20)",
        networkId: "bep20",
        withdrawsEnabled: true,
      },
    ],
    balanceUnavailable: false,
  },
  {
    coinName: "Bitcoin",
    coinTicker: "BTC",
    coinBalance: {
      cryptoBalance: "2.41530000",
      nairaBalance: "362295000.00",
      lastUpdated: ago(0.05 * HOUR),
    },
    networks: [
      {
        id: "res-btc-native",
        address: "bc1qpreview4k7x9m2n8p0q3r5s7t9v1w3x5y7z9a",
        network: "Bitcoin",
        networkId: "bitcoin",
        withdrawsEnabled: true,
      },
    ],
    balanceUnavailable: false,
  },
  {
    coinName: "Ethereum",
    coinTicker: "ETH",
    coinBalance: { cryptoBalance: "0.0", nairaBalance: null, lastUpdated: null },
    networks: [
      {
        id: "res-eth-erc20",
        address: "0xpreview8d2f1a6c4b9e3h5j7k1m3n5p7q9r1s3t5u7",
        network: "Ethereum (ERC20)",
        networkId: "erc20",
        withdrawsEnabled: false,
      },
    ],
    balanceUnavailable: true,
  },
];

/** Money in and out of the company's own accounts. */
export const treasuryMovements = Array.from({ length: 34 }, (_, i) => {
  const outward = i % 3 === 0;
  const amount = Math.round(between(15_000, 2_400_000) / 50) * 50;
  return {
    id: uuid(),
    transferDirection: outward ? "Outwards" : "Inwards",
    transferType: outward
      ? pick(["WITHDRAWAL", "USER_PAYMENT", "REFUND"])
      : pick(["PROFIT_COLLECTION", "CRYPTO_SALE_COMMISSION", "SWAP_FEE"]),
    status: i === 4 ? "Pending" : i === 9 ? "Failed" : "Completed",
    amount: amount.toFixed(2),
    fees: outward ? "50.00" : "0.00",
    vat: outward ? "3.75" : "0.00",
    narration: outward ? "Payout to company operating account" : "Platform earnings sweep",
    paymentReference: `TRS-${(500_000 + i).toString(36).toUpperCase()}`,
    counterpartyAccountName: outward ? "FlurryPay Operations" : null,
    counterpartyAccountNumber: outward ? "0123456789" : null,
    counterpartyBankName: outward ? "Guaranty Trust Bank" : null,
    relatedUserId: outward && i % 6 === 0 ? fixture(users, i % users.length).id : null,
    createdAt: ago(between(0.2, 40) * DAY),
  };
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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

/**
 * Notification fixtures, every one with somewhere to go.
 *
 * Deliberately: the whole point of the entityType/entityId pair is that the bell
 * opens the thing it is telling you about, and a preview where nothing is
 * clickable would show the feature as it used to be rather than as it is. One row
 * carries neither, to exercise the unlinked case.
 */
export const notifications = [
  {
    id: uuid(),
    title: "Stranded transfers need attention",
    body: "Transfers have been processing for over 24 hours.",
    type: "warning",
    priority: "high",
    targetRole: "all",
    read: false,
    entityType: "stranded",
    entityId: null,
    link: null,
    createdAt: ago(2 * HOUR),
  },
  {
    id: uuid(),
    title: "Outbound transfers restricted automatically — CASE-2026-0007",
    body:
      "A CRITICAL risk case opened and outgoing transfers were paused automatically for the " +
      "customer. Review it and either clear the case (which lifts the restriction) or take it further.",
    type: "error",
    priority: "high",
    targetRole: "all",
    read: false,
    entityType: "case",
    entityId: riskCases[0]?.id ?? null,
    link: null,
    createdAt: ago(3 * HOUR),
  },
  {
    id: uuid(),
    title: "New compliance alert",
    body: "A critical structuring alert was raised.",
    type: "error",
    priority: "high",
    targetRole: "all",
    read: false,
    entityType: "alert",
    entityId: complianceAlerts[0]?.id ?? null,
    link: null,
    createdAt: ago(5 * HOUR),
  },
  {
    id: uuid(),
    title: `New support message from ${fullName(fixture(users, 4))}`,
    body: "I was charged twice for the same airtime top-up this morning. Can you check?",
    type: "info",
    priority: "high",
    targetRole: "all",
    read: false,
    entityType: "chatRoom",
    entityId: `U_${fixture(users, 4).id}_A_${PREVIEW_ADMIN_ID}`,
    link: null,
    createdAt: ago(7 * HOUR),
  },
  {
    id: uuid(),
    title: `[Account Appeal] Locked out after changing phone — ${fullName(fixture(users, 11))}`,
    body: `From: ${fullName(fixture(users, 11))} <${fixture(users, 11).email}>\n\nI changed my number and now I can't sign in.`,
    type: "warning",
    priority: "high",
    targetRole: "all",
    read: false,
    entityType: "supportMessage",
    entityId: "appeal:preview-appeal-1",
    link: null,
    createdAt: ago(9 * HOUR),
  },
  {
    id: uuid(),
    title: "KYC submissions waiting",
    body: "Level 2 documents are waiting for review.",
    type: "info",
    priority: "medium",
    targetRole: "all",
    read: true,
    entityType: "kyc",
    entityId: kycProfiles[0]?.userId ?? null,
    link: null,
    createdAt: ago(DAY),
  },
  {
    id: uuid(),
    title: "Company liquidity at 86%",
    body: "Float reserve ratio has fallen below the 90% threshold. Top up settlement reserves.",
    type: "warning",
    priority: "high",
    targetRole: "superAdmin",
    read: true,
    entityType: null,
    entityId: null,
    link: "/treasury",
    createdAt: ago(2 * DAY),
  },
  {
    id: uuid(),
    title: "Nightly reconciliation finished",
    body: "No drift detected across 48 customer wallets.",
    type: "success",
    priority: "low",
    targetRole: "all",
    read: true,
    entityType: null,
    entityId: null,
    link: null,
    createdAt: ago(3 * DAY),
  },
];

/* ─── Support ────────────────────────────────────────────────────────────── */

/**
 * The merged support inbox: appeals and contact messages in one list, exactly as
 * the API returns them, with the `type` discriminator that makes a row's identity
 * the (type, id) pair rather than the id alone.
 */
export const supportMessages = [
  {
    id: "preview-appeal-1",
    type: "appeal" as const,
    name: fullName(fixture(users, 11)),
    email: fixture(users, 11).email,
    subject: "Locked out after changing phone",
    message:
      "I changed my number and now I can't sign in. I've attached a photo of my ID. " +
      "Please help, my salary is in there.",
    explanation:
      "I changed my number and now I can't sign in. I've attached a photo of my ID. " +
      "Please help, my salary is in there.",
    reasonForAppeal: "Locked out after changing phone",
    category: null,
    fileUrl: "https://example.invalid/preview-attachment.jpg",
    fileName: "id-card.jpg",
    userId: fixture(users, 11).id,
    number: fixture(users, 11).phoneNumber,
    status: "pending",
    readByAdmin: false,
    replies: [] as { message: string; sentAt: string; adminEmail: string }[],
    submittedAt: ago(9 * HOUR),
  },
  {
    id: "preview-contact-1",
    type: "contact" as const,
    name: fullName(fixture(users, 2)),
    email: fixture(users, 2).email,
    subject: "Double charge on airtime",
    message: "I was charged twice for the same airtime top-up this morning. Can you check?",
    category: "Billing",
    fileUrl: null,
    fileName: null,
    userId: fixture(users, 2).id,
    number: null,
    status: "under_review",
    readByAdmin: true,
    replies: [
      {
        message:
          "Thanks for letting us know — I can see both attempts and I'm checking with the " +
          "provider now. I'll come back to you today.",
        sentAt: ago(4 * HOUR),
        adminEmail: "preview.admin@example.com",
      },
    ],
    submittedAt: ago(DAY),
  },
  {
    id: "preview-appeal-2",
    type: "appeal" as const,
    name: fullName(fixture(users, 5)),
    email: fixture(users, 5).email,
    subject: "Transfers paused — I can explain the deposits",
    message:
      "My transfers are paused. The deposits are from my business customers, I can send invoices.",
    explanation:
      "My transfers are paused. The deposits are from my business customers, I can send invoices.",
    reasonForAppeal: "Transfers paused — I can explain the deposits",
    category: null,
    fileUrl: null,
    fileName: null,
    userId: fixture(users, 5).id,
    number: fixture(users, 5).phoneNumber,
    status: "approved",
    readByAdmin: true,
    replies: [
      {
        message:
          "Thank you for the invoices. Everything checks out and your transfers are working " +
          "again. Sorry for the interruption.",
        sentAt: ago(2 * DAY),
        adminEmail: "preview.admin@example.com",
      },
    ],
    submittedAt: ago(4 * DAY),
  },
  {
    id: "preview-contact-2",
    type: "contact" as const,
    name: "Tunde Bakare",
    email: "tunde.bakare@example.test",
    subject: "Do you support business accounts?",
    message: "I run a small logistics company and wanted to ask about business accounts.",
    category: "General",
    fileUrl: null,
    fileName: null,
    userId: null,
    number: null,
    status: "resolved",
    readByAdmin: true,
    replies: [] as { message: string; sentAt: string; adminEmail: string }[],
    submittedAt: ago(6 * DAY),
  },
];

/** Live chat rooms, keyed the way the API builds room ids: U_<userId>_A_<adminId>. */
export const chatRooms = [4, 2, 17].map((index, position) => {
  const user = fixture(users, index);
  return {
    id: uuid(),
    roomId: `U_${user.id}_A_${PREVIEW_ADMIN_ID}`,
    userId: user.id,
    userName: fullName(user),
    userEmail: user.email,
    lastMessage: [
      "I was charged twice for the same airtime top-up this morning. Can you check?",
      "Thanks, that's sorted now.",
      "Still waiting on the refund, any update?",
    ][position],
    lastMessageAt: ago((position * 6 + 1) * HOUR),
    lastMessageFromAdmin: position === 1,
    unreadCount: position === 1 ? 0 : 1,
    createdAt: ago((position + 2) * DAY),
    updatedAt: ago((position * 6 + 1) * HOUR),
  };
});

/** Messages per room, oldest first — the order a conversation is read in. */
export const chatMessages: Record<
  string,
  {
    id: string;
    roomId: string;
    senderId: string;
    message: string;
    read: boolean;
    createdAt: string;
  }[]
> = Object.fromEntries(
  chatRooms.map((room, position) => [
    room.roomId,
    [
      {
        id: uuid(),
        roomId: room.roomId,
        senderId: room.userId,
        message: "Hello, I need help with something on my account.",
        read: true,
        createdAt: ago((position * 6 + 4) * HOUR),
      },
      {
        id: uuid(),
        roomId: room.roomId,
        senderId: PREVIEW_ADMIN_ID,
        message: "Of course — what's happened?",
        read: true,
        createdAt: ago((position * 6 + 3) * HOUR),
      },
      {
        id: uuid(),
        roomId: room.roomId,
        senderId: position === 1 ? PREVIEW_ADMIN_ID : room.userId,
        message: room.lastMessage ?? "",
        read: position === 1,
        createdAt: ago((position * 6 + 1) * HOUR),
      },
    ],
  ]),
);

export const PREVIEW_NOW = NOW;
