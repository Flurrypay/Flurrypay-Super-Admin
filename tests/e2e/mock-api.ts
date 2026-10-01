import type { Page, Route } from "@playwright/test";

/**
 * TEST-ONLY network mock of the FlurryPay API (api/src/app routes), used so
 * end-to-end tests exercise real browser flows without a backend. Response
 * shapes mirror the API controllers; values are synthetic test fixtures and
 * never ship with the application.
 */

export const API_ORIGIN = "http://localhost:4000";
const APP_ORIGIN = "http://localhost:3000";

/** A JWT-shaped token whose payload carries a far-future `exp`. */
export const TEST_TOKEN = `test.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")}.sig`;

export interface TestAdmin {
  id: string;
  role: "admin" | "executive" | "superAdmin";
  permissions: string[];
  hasActivated2FA?: boolean;
  pinIsSet?: boolean;
}

export const SUPER_ADMIN: TestAdmin = { id: "adm-super-0001", role: "superAdmin", permissions: [] };
export const SUPPORT_STAFF: TestAdmin = {
  id: "adm-staff-0002",
  role: "admin",
  permissions: ["users.view"],
};

export const TEST_TRANSACTIONS = [
  {
    id: "tx-0001",
    userId: "usr-0001",
    transactionType: "FIAT_WITHDRAWAL",
    status: "FAILED",
    amount: "150075.50000000",
    currency: "NGN",
    currencyType: "FIAT",
    fee: "50.00000000",
    reference: "TEST-REF-0001",
    provider: "test-provider",
    failureReason: "Beneficiary bank unavailable",
    failureOurFault: false,
    // An open flag, so the Flag column and the transaction drawer's banner have
    // something to render.
    flaggedAt: "2026-09-22T10:00:00.000Z",
    flagReason: "SUSPECTED_FRAUD",
    flagSeverity: "CRITICAL",
    flagNote: "Third transfer to the same new beneficiary within the hour.",
    flaggedByAdminId: "adm-super-0001",
    // A withdrawal whose principal and fee are separate ledger movements — the
    // case a single before/after pair cannot express.
    walletMovement: {
      balanceBefore: "200000.00",
      balanceAfter: "49874.50",
      netChange: "-150125.50",
      hasGap: false,
      entries: [
        {
          id: "wl-0001",
          direction: "DEBIT",
          amountNaira: "150075.50",
          balanceBefore: "200000.00",
          balanceAfter: "49924.50",
          source: "FIAT_WITHDRAWAL",
          narration: null,
          createdAt: "2026-09-22T09:15:00.000Z",
        },
        {
          id: "wl-0002",
          direction: "DEBIT",
          amountNaira: "50.00",
          balanceBefore: "49924.50",
          balanceAfter: "49874.50",
          source: "TRANSFER_FEE",
          narration: "Transfer fee",
          createdAt: "2026-09-22T09:15:00.000Z",
        },
      ],
    },
    createdAt: "2026-09-22T09:15:00.000Z",
    updatedAt: "2026-09-22T09:16:00.000Z",
    user: {
      id: "usr-0001",
      email: "test.customer@example.com",
      firstName: "Test",
      lastName: "Customer",
    },
  },
  {
    id: "tx-0002",
    userId: "usr-0001",
    transactionType: "CRYPTO_BUY",
    status: "COMPLETED",
    amount: "0.00012345",
    currency: "BTC",
    currencyType: "CRYPTO",
    fee: "0",
    reference: "TEST-REF-0002",
    createdAt: "2026-09-22T08:00:00.000Z",
    updatedAt: "2026-09-22T08:00:05.000Z",
    user: {
      id: "usr-0001",
      email: "test.customer@example.com",
      firstName: "Test",
      lastName: "Customer",
    },
  },
];

export const TEST_USERS = [
  {
    id: "usr-0001",
    email: "test.customer@example.com",
    firstName: "Test",
    lastName: "Customer",
    userName: "testcustomer",
    isConfirmed: true,
    level: 1,
    walletBalance: 2500.5,
    transactionCount: 2,
    createdAt: "2026-09-20T10:00:00.000Z",
    fcmToken: "must-not-render",
  },
  {
    id: "usr-0002",
    email: "second.customer@example.com",
    firstName: "Second",
    lastName: "Customer",
    isConfirmed: true,
    isSuspended: true,
    level: 2,
    walletBalance: "0",
    createdAt: "2026-09-18T10:00:00.000Z",
  },
];

export const TEST_PAYOUT_PROVIDERS = [
  {
    id: "pp-0001",
    provider: "nomba",
    name: "Nomba settlement",
    bankName: "Nomba MFB",
    accountName: "FlurryPay Ltd",
    // The top-up instruction, which is why the console shows it unmasked.
    accountNumber: "5119947015",
    bankCode: "000030",
    environment: "live",
    isActive: true,
    isDefault: true,
    cachedBalance: 48250300.55,
    lastSyncedAt: "2026-09-23T11:00:00.000Z",
    hasApiKey: true,
    apiKeyMasked: "sk_live••••1234",
  },
  {
    id: "pp-0002",
    provider: "falconpay",
    name: "FalconPay",
    bankName: "Providus Bank",
    accountName: "FlurryPay Ltd",
    accountNumber: "9930014477",
    bankCode: "000023",
    environment: "live",
    isActive: false,
    isDefault: false,
    cachedBalance: 3120000,
    lastSyncedAt: "2026-09-23T06:00:00.000Z",
    hasApiKey: true,
  },
];

export const TEST_CRYPTO_RESERVES = [
  {
    coinName: "Tether",
    coinTicker: "USDT",
    coinBalance: {
      cryptoBalance: "184320.44",
      nairaBalance: "285696682.00",
      lastUpdated: "2026-09-23T11:30:00.000Z",
    },
    networks: [
      {
        id: "res-usdt-trc20",
        address: "TXq7test9a3c1f0d2b8e4a6c5d7f9e1b3a5",
        network: "Tron (TRC20)",
        networkId: "trc20",
        withdrawsEnabled: true,
      },
    ],
    balanceUnavailable: false,
  },
  {
    // An unanswered balance. Shown as unavailable, never as zero — they look
    // identical on screen and mean opposite things.
    coinName: "Ethereum",
    coinTicker: "ETH",
    coinBalance: { cryptoBalance: "0.0", nairaBalance: null, lastUpdated: null },
    networks: [
      {
        id: "res-eth-erc20",
        address: "0xtest8d2f1a6c4b9e3",
        network: "Ethereum (ERC20)",
        networkId: "erc20",
        withdrawsEnabled: false,
      },
    ],
    balanceUnavailable: true,
  },
];

export const TEST_TREASURY_MOVEMENTS = [
  {
    id: "mv-0001",
    transferDirection: "Inwards",
    transferType: "PROFIT_COLLECTION",
    status: "Completed",
    amount: "420000.00",
    fees: "0.00",
    vat: "0.00",
    narration: "Platform earnings sweep",
    paymentReference: "TRS-TEST-0001",
    counterpartyAccountName: null,
    counterpartyAccountNumber: null,
    counterpartyBankName: null,
    relatedUserId: null,
    createdAt: "2026-09-23T08:00:00.000Z",
  },
  {
    id: "mv-0002",
    transferDirection: "Outwards",
    transferType: "WITHDRAWAL",
    status: "Completed",
    amount: "1500000.00",
    fees: "50.00",
    vat: "3.75",
    narration: "Payout to company operating account",
    paymentReference: "TRS-TEST-0002",
    counterpartyAccountName: "FlurryPay Operations",
    counterpartyAccountNumber: "0123456789",
    counterpartyBankName: "Guaranty Trust Bank",
    relatedUserId: null,
    createdAt: "2026-09-22T15:00:00.000Z",
  },
];

export const TEST_STRANDED = [
  {
    reference: "TEST-STRANDED-0001",
    transactionType: "FIAT_WITHDRAWAL",
    status: "PROCESSING",
    userId: "usr-0001",
    email: "test.customer@example.com",
    fullName: "Test Customer",
    amountNaira: 20000,
    feeAlreadyRefundedNaira: 0,
    owedNaira: 20000,
    ageHours: 30,
    createdAt: "2026-09-22T06:00:00.000Z",
    stage: "provider_submitted",
    alreadyRefunded: false,
  },
];

/** Exported so specs can build their own handler tables and still be type-checked. */
export type Handler = (route: Route, url: URL, body: unknown) => unknown;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID, Accept",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "X-Request-ID, Content-Disposition, X-Row-Count",
  };
}

export async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { ...corsHeaders(), "X-Request-ID": "test-request-0001" },
    body: JSON.stringify(body),
  });
}

/** Installs the mock. `overrides` replace handlers by `METHOD path` (path without query). */
export async function mockApi(
  page: Page,
  admin: TestAdmin,
  overrides: Record<string, Handler> = {},
) {
  const handlers: Record<string, Handler> = {
    "POST /flurrypay-website-admin/login": (route) =>
      json(route, 200, { message: "A confirmation mail has been sent" }),
    "POST /flurrypay-website-admin/verify-login": (route) =>
      json(route, 200, { requires2FA: true, email: "ops@example.com", message: "Email verified." }),
    "POST /flurrypay-website-admin/verify-2fa-login": (route) =>
      json(route, 200, { message: "Login successful", token: TEST_TOKEN }),
    "GET /flurrypay-website-admin/details": (route) =>
      json(route, 200, {
        adminDetails: {
          id: admin.id,
          firstName: "Test",
          lastName: "Operator",
          email: "ops@example.com",
          userName: "ops",
          role: admin.role,
          permissions: admin.permissions,
          hasActivated2FA: admin.hasActivated2FA ?? true,
          pinIsSet: admin.pinIsSet ?? true,
          phoneNumber: "+234801•••678",
          trustedDeviceCount: 1,
        },
      }),
    // Deliberately the OLD response shape: `{ message }` with no array at all,
    // which is what an API build before paging answers an empty inbox with. Kept
    // as a compatibility check — the bell must render against either.
    "GET /flurrypay-website-admin-notifications": (route) =>
      json(route, 200, { message: "No notifications found" }),
    "GET /transactions/admin/flags/summary": (route) =>
      json(route, 200, { success: true, data: { total: 1, CRITICAL: 1 } }),
    "GET /flurrypay-website-admin-financial/payout-providers/balances": (route) =>
      json(route, 200, {
        success: true,
        data: {
          providers: TEST_PAYOUT_PROVIDERS,
          activeProvider: TEST_PAYOUT_PROVIDERS[0],
          nombaSettlement: {
            balance: 48250300.55,
            currency: "NGN",
            lastSynced: "2026-09-23T11:00:00.000Z",
          },
          totalUserLiability: 1200000,
          coverage: 47050300.55,
          isUnderFunded: false,
        },
      }),
    "GET /flurrypay-website-admin-wallet/get-wallets": (route) =>
      json(route, 200, { message: "ok", wallets: TEST_CRYPTO_RESERVES }),
    "GET /flurrypay-website-admin-wallet/withdrawal-limit": (route) =>
      json(route, 200, {
        success: true,
        data: {
          limit: 5000000,
          used: 1250000,
          remaining: 3750000,
          currency: "NGN",
          windowHours: 24,
        },
      }),
    "GET /flurrypay-website-admin-financial/transfers": (route) =>
      json(route, 200, {
        data: { transfers: TEST_TREASURY_MOVEMENTS, total: TEST_TREASURY_MOVEMENTS.length },
      }),
    "GET /transactions/admin/all": (route, url) => {
      const status = url.searchParams.get("status");
      const rows = TEST_TRANSACTIONS.filter((tx) => !status || tx.status === status);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      return json(route, 200, {
        success: true,
        data: {
          transactions: rows.slice(0, limit),
          pagination: { total: rows.length, page: 1, limit },
        },
      });
    },
    "GET /kyc/admin/list": (route) => json(route, 200, { success: true, total: 0, data: [] }),
    "GET /flurrypay-website-admin/users/search": (route) =>
      json(route, 200, {
        data: TEST_USERS,
        pagination: { total: TEST_USERS.length, page: 1, limit: 50, totalPages: 1 },
      }),
    "GET /flurrypay-website-admin/reports/users": (route) =>
      json(route, 200, {
        timeZone: "Africa/Lagos",
        signups: [{ day: "2026-09-20", count: 1 }],
        levels: [{ level: 1, count: 1 }],
        totals: { total: 1, confirmed: 1, blocked: 0, suspended: 0, frozen: 0, locked: 0 },
      }),
    "GET /flurrypay-website-admin/search": (route) => json(route, 200, { users: [] }),
    "GET /flurrypay-website-admin/roles": (route) => json(route, 200, { roles: [] }),
    "GET /flurrypay-website-admin-stranded/summary": (route) =>
      json(route, 200, { success: true, data: { count: 0, totalNaira: 0, oldestHours: 0 } }),
    "GET /flurrypay-website-admin-stranded": (route) =>
      json(route, 200, {
        success: true,
        data: { items: TEST_STRANDED, summary: { count: 1, totalNaira: 20000, oldestHours: 30 } },
      }),
    "GET /flurrypay-website-admin-compliance/dashboard": (route) =>
      json(route, 200, {
        success: true,
        data: {
          alerts: { open: 0, critical: 0, oldestOpenAt: null, oldestOpenAgeDays: null },
          customers: { total: 1, highRisk: 0, pep: 0, neverProfiled: 1 },
          reports: { open: 0, filed: 0 },
        },
      }),
    "GET /flurrypay-website-admin-risk/overview": (route) =>
      json(route, 200, {
        success: true,
        data: {
          cases: { open: 0, awaitingCustomer: 0, overdue: 0 },
          holds: { active: 0, totalHeldNaira: 0 },
          interventionsLast7Days: 0,
        },
      }),
    "GET /flurrypay-website-admin-financial/audit-logs": (route) =>
      json(route, 200, { success: true, data: [], total: 0, limit: 50, offset: 0 }),
    "GET /flurrypay-website-admin/all": (route) => json(route, 200, { admins: [] }),
    "POST /flurrypay-website-admin/logout": (route) =>
      json(route, 200, { message: "Logged out successfully." }),
    ...overrides,
  };

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    const url = new URL(request.url());
    const handler = handlers[`${request.method()} ${url.pathname}`];
    if (!handler) {
      await json(route, 404, { message: "Not mocked in test" });
      return;
    }
    await handler(route, url, request.postDataJSON() as unknown);
  });
}

/** Signs in through the real login flow and marks the tour as seen. */
export async function signIn(page: Page, admin: TestAdmin, next = "/") {
  await page.addInitScript((id) => {
    window.localStorage.setItem(`fp.tour.v1.${id}`, JSON.stringify({ status: "completed" }));
  }, admin.id);
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Work email").fill("ops@example.com");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByLabel("Authenticator code").fill("654321");
  await page.getByRole("button", { name: "Verify" }).click();
}
