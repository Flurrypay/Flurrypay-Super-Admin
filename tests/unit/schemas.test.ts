// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { kycProfileSchema } from "@/features/kyc/api";
import { userDetailSchema } from "@/features/users/api";

const level = { status: "PENDING" };

describe("allowlisted API schemas", () => {
  it("keeps only the last four digits of identity numbers and drops provider payloads", () => {
    const parsed = kycProfileSchema.parse({
      id: "k1",
      userId: "u1",
      currentLevel: 1,
      dailyWithdrawalLimit: "50000.00",
      level1: {
        ...level,
        bvnLast4: "22212345678",
        ninLast4: "12345678901",
        bvnVerificationResponse: { photo: "base64..." },
      },
      level2: level,
      level3: level,
    });
    expect(parsed.level1.bvnLast4).toBe("5678");
    expect(parsed.level1.ninLast4).toBe("8901");
    expect(JSON.stringify(parsed)).not.toContain("22212345678");
    expect(JSON.stringify(parsed)).not.toContain("base64");
  });

  it("drops sensitive user fields the API still returns", () => {
    const parsed = userDetailSchema.parse({
      id: "u1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Obi",
      walletBalance: 1500.5,
      bvn: { type: "Buffer", data: [1, 2, 3] },
      fcmToken: "push-token",
      quidaxId: "qx-1",
    });
    expect(parsed.walletBalance).toBe("1500.5");
    expect(parsed).not.toHaveProperty("bvn");
    expect(parsed).not.toHaveProperty("fcmToken");
    expect(parsed).not.toHaveProperty("quidaxId");
  });

  it("degrades malformed optional fields instead of failing", () => {
    const result = z
      .array(userDetailSchema)
      .safeParse([{ id: "u1", email: "a@b.c", createdAt: "not a date", level: "x" }]);
    expect(result.success).toBe(true);
    expect(result.data?.[0]?.createdAt).toBeNull();
    expect(result.data?.[0]?.level).toBe(0);
  });
});
