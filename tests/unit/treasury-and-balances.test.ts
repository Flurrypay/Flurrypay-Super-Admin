// @vitest-environment node
import { describe, expect, it } from "vitest";

import { transactionSchema } from "@/features/transactions/api";
import { cryptoReserveSchema, payoutProviderSchema } from "@/features/treasury/api";

function transaction(overrides: Record<string, unknown> = {}) {
  return transactionSchema.parse({
    id: "t1",
    userId: "u1",
    transactionType: "FIAT_WITHDRAWAL",
    status: "COMPLETED",
    ...overrides,
  });
}

const WITHDRAWAL_MOVEMENT = {
  balanceBefore: "12400.00",
  balanceAfter: "7350.00",
  netChange: "-5050.00",
  hasGap: false,
  entries: [
    {
      id: "wl1",
      direction: "DEBIT",
      amountNaira: "5000.00",
      balanceBefore: "12400.00",
      balanceAfter: "7400.00",
      source: "FIAT_WITHDRAWAL",
      narration: null,
      createdAt: "2026-09-23T12:00:00Z",
    },
    {
      id: "wl2",
      direction: "DEBIT",
      amountNaira: "50.00",
      balanceBefore: "7400.00",
      balanceAfter: "7350.00",
      source: "TRANSFER_FEE",
      narration: "Transfer fee",
      createdAt: "2026-09-23T12:00:00Z",
    },
  ],
};

describe("balance before and after on a transaction", () => {
  it("keeps both balances as exact decimal strings", () => {
    const parsed = transaction({ walletMovement: WITHDRAWAL_MOVEMENT });
    // Never numbers: a balance put through a float is a balance that can be
    // wrong in the last kobo, and these are shown to customers' support agents.
    expect(parsed.walletMovement?.balanceBefore).toBe("12400.00");
    expect(parsed.walletMovement?.balanceAfter).toBe("7350.00");
    expect(parsed.walletMovement?.netChange).toBe("-5050.00");
  });

  it("keeps the principal and the fee as separate entries", () => {
    // The case a single before/after pair cannot express: ₦5,000 left and ₦50
    // left, and the customer's balance dropped by ₦5,050.
    const parsed = transaction({ walletMovement: WITHDRAWAL_MOVEMENT });
    expect(parsed.walletMovement?.entries).toHaveLength(2);
    expect(parsed.walletMovement?.entries[1]?.source).toBe("TRANSFER_FEE");
    expect(parsed.walletMovement?.entries[0]?.balanceAfter).toBe(
      parsed.walletMovement?.entries[1]?.balanceBefore,
    );
  });

  // The distinction the UI depends on: null renders as "no naira movement",
  // and a zero would be a claim about a balance we do not have.
  it("is null, not zero, when the transaction never touched the naira wallet", () => {
    const cryptoSend = transaction({ transactionType: "CRYPTO_SEND", currencyType: "CRYPTO" });
    expect(cryptoSend.walletMovement).toBeNull();
  });

  it("carries the gap flag through, so a broken chain is not smoothed over", () => {
    const parsed = transaction({
      walletMovement: { ...WITHDRAWAL_MOVEMENT, hasGap: true },
    });
    expect(parsed.walletMovement?.hasGap).toBe(true);
  });

  it("survives an API that has not learned to send the movement yet", () => {
    expect(transaction().walletMovement).toBeNull();
    expect(transaction({ walletMovement: "not an object" }).walletMovement).toBeNull();
  });
});

describe("treasury accounts", () => {
  it("keeps the company's own account number readable", () => {
    // Unlike a customer's, this is not masked: it IS the top-up instruction,
    // and a masked number cannot be transferred to.
    const parsed = payoutProviderSchema.parse({
      id: "p1",
      provider: "nomba",
      name: "Nomba settlement",
      accountNumber: "5119947015",
      bankName: "Nomba MFB",
      cachedBalance: 48_250_300.55,
      isActive: true,
    });
    expect(parsed.accountNumber).toBe("5119947015");
    expect(parsed.cachedBalance).toBe("48250300.55");
  });

  it("never keeps provider credentials, even masked ones", () => {
    const parsed = payoutProviderSchema.parse({
      id: "p1",
      provider: "falconpay",
      name: "FalconPay",
      apiKey: "sk_live_realsecret",
      apiKeyMasked: "sk_live••••1234",
      webhookSecretMasked: "whsec••••abcd",
      cachedBalance: 0,
    });
    const json = JSON.stringify(parsed);
    expect(json).not.toContain("realsecret");
    expect(json).not.toContain("••••");
  });
});

describe("crypto reserves", () => {
  it("reports an unpriced balance as null rather than zero", () => {
    // An unanswered balance and an empty reserve look identical on screen and
    // mean opposite things, so the schema must not collapse one into the other.
    const parsed = cryptoReserveSchema.parse({
      coinTicker: "ETH",
      coinName: "Ethereum",
      coinBalance: { cryptoBalance: "0.0", nairaBalance: null },
      balanceUnavailable: true,
    });
    expect(parsed.coinBalance.nairaBalance).toBeNull();
    expect(parsed.balanceUnavailable).toBe(true);
  });

  it("keeps crypto amounts as strings at full precision", () => {
    const parsed = cryptoReserveSchema.parse({
      coinTicker: "BTC",
      coinName: "Bitcoin",
      coinBalance: { cryptoBalance: "2.41530000", nairaBalance: "362295000.00" },
      networks: [
        {
          id: "n1",
          address: "bc1q…",
          network: "Bitcoin",
          networkId: "bitcoin",
          withdrawsEnabled: true,
        },
      ],
    });
    expect(parsed.coinBalance.cryptoBalance).toBe("2.41530000");
    expect(parsed.networks[0]?.withdrawsEnabled).toBe(true);
  });

  it("defaults a network to withdrawals-disabled when the API does not say", () => {
    // Fail closed on this one: offering a withdraw button for a chain that
    // cannot withdraw sends the admin into a refusal at the exchange.
    const parsed = cryptoReserveSchema.parse({
      coinTicker: "USDT",
      coinName: "Tether",
      coinBalance: { cryptoBalance: "100", nairaBalance: "155000" },
      networks: [{ id: "n1", address: "0x…", network: "Some new chain" }],
    });
    expect(parsed.networks[0]?.withdrawsEnabled).toBe(false);
  });
});
