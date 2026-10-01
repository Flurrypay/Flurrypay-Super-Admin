// @vitest-environment node
import { describe, expect, it } from "vitest";

import { adminAccountSchema, invitationState } from "@/features/administrators/api";
import { auditEntrySchema, auditFilters } from "@/features/audit/api";
import { canAccess } from "@/features/auth/permissions";
import { alertSchema } from "@/features/compliance/api";
import { strandedTransferSchema } from "@/features/operations/api";
import { formatAge } from "@/features/operations/format";
import { payoutProviderSchema } from "@/features/treasury/api";
import { userFilters } from "@/features/users/api";

const NOW = Date.parse("2026-09-23T12:00:00Z");

function admin(overrides: Record<string, unknown> = {}) {
  return adminAccountSchema.parse({
    id: "a1",
    email: "ops@example.test",
    role: "admin",
    permissions: [],
    ...overrides,
  });
}

describe("administrator invitations", () => {
  it("is accepted once the temporary password was replaced", () => {
    expect(invitationState(admin({ mustResetPassword: false }), NOW)).toBe("accepted");
  });

  it("is pending until the expiry and expired after it", () => {
    const pending = admin({ mustResetPassword: true, invitationExpiresAt: "2026-09-24T00:00:00Z" });
    const expired = admin({ mustResetPassword: true, invitationExpiresAt: "2026-09-22T00:00:00Z" });
    expect(invitationState(pending, NOW)).toBe("pending");
    expect(invitationState(expired, NOW)).toBe("expired");
  });

  it("keeps an invitation without a recorded expiry pending", () => {
    expect(invitationState(admin({ mustResetPassword: true }), NOW)).toBe("pending");
  });

  it("never lets secrets through the admin allowlist", () => {
    const parsed = admin({ password: "$argon2id$...", authSecret: "JBSWY3DP", sessionId: "s1" });
    const json = JSON.stringify(parsed);
    expect(json).not.toContain("argon2");
    expect(json).not.toContain("JBSWY3DP");
    expect(json).not.toContain("s1");
  });
});

describe("access rules", () => {
  it("grants anyPermission when one of the permissions is held", () => {
    const rule = { anyPermission: ["transactions.view", "users.view"] } as const;
    expect(canAccess({ role: "admin", permissions: ["users.view"] }, rule)).toBe(true);
    expect(canAccess({ role: "admin", permissions: ["kyc.review"] }, rule)).toBe(false);
    expect(canAccess({ role: "superAdmin", permissions: [] }, rule)).toBe(true);
  });
});

describe("filters sent to list and export endpoints", () => {
  it("omits empty user filters", () => {
    expect(userFilters({ search: "", status: null, level: null })).toEqual({
      search: undefined,
      status: undefined,
      level: undefined,
    });
    expect(userFilters({ search: "ada", status: "frozen", level: "2" })).toEqual({
      search: "ada",
      status: "frozen",
      level: "2",
    });
  });

  it("trims audit search and keeps the target and date range", () => {
    expect(
      auditFilters({ search: "  10.0.0.1 ", targetId: "u1", from: "2026-09-01T00:00:00Z" }),
    ).toMatchObject({ search: "10.0.0.1", targetId: "u1", from: "2026-09-01T00:00:00Z" });
    expect(auditFilters({ search: "   " }).search).toBeUndefined();
  });
});

describe("new module schemas", () => {
  it("reads structured audit fields and tolerates entries written before they existed", () => {
    const legacy = auditEntrySchema.parse({
      id: "e1",
      adminId: "a1",
      adminEmail: "ops@example.test",
      action: "ADMIN_LOGIN",
      createdAt: "2026-09-01T00:00:00Z",
    });
    expect(legacy.targetId).toBeNull();
    expect(legacy.before).toBeNull();
    const structured = auditEntrySchema.parse({
      ...legacy,
      targetType: "user",
      targetId: "u1",
      reason: "Chargeback investigation",
      before: { isSuspended: false },
      after: { isSuspended: true },
    });
    expect(structured.after).toEqual({ isSuspended: true });
  });

  it("drops customer credentials if an alert ever includes the full user record", () => {
    const parsed = alertSchema.parse({
      id: "al1",
      userId: "u1",
      rule: "STRUCTURING",
      severity: "HIGH",
      status: "OPEN",
      summary: "Several deposits just under the threshold",
      user: {
        id: "u1",
        email: "c@example.test",
        firstName: "Ada",
        lastName: "O",
        password: "$argon2id$secret",
        transactionPin: "hash",
        bvn: "22212345678",
      },
    });
    const json = JSON.stringify(parsed);
    expect(json).not.toContain("argon2");
    expect(json).not.toContain("22212345678");
    expect(parsed.user?.firstName).toBe("Ada");
  });

  it("keeps stranded amounts as exact decimal strings", () => {
    const parsed = strandedTransferSchema.parse({
      reference: "TRX-1",
      userId: "u1",
      amountNaira: 125000.5,
      owedNaira: "125000.50",
      feeAlreadyRefundedNaira: 0,
      ageHours: 30,
    });
    expect(parsed.owedNaira).toBe("125000.50");
    expect(parsed.amountNaira).toBe("125000.5");
  });

  it("never keeps payout provider credentials, even masked", () => {
    const parsed = payoutProviderSchema.parse({
      id: "p1",
      provider: "falconpay",
      name: "FalconPay",
      apiKeyMasked: "sk_live••••1234",
      webhookSecretMasked: "whsec••••abcd",
      cachedBalance: 1000,
      hasApiKey: true,
    });
    expect(JSON.stringify(parsed)).not.toContain("••••");
  });
});

describe("queue ages", () => {
  it("formats hours coarsely", () => {
    expect(formatAge(0)).toBe("< 1 h");
    expect(formatAge(5)).toBe("5 h");
    expect(formatAge(48)).toBe("2 d");
    expect(formatAge(51)).toBe("2 d 3 h");
  });
});
