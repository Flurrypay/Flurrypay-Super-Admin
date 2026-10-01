import { describe, expect, it } from "vitest";

import { canAccess, hasPermission, PERMISSION_INFO } from "@/features/auth/permissions";

describe("permission mirror", () => {
  it("lets super admins bypass the permission list, like the API", () => {
    expect(hasPermission({ role: "superAdmin", permissions: [] }, "wallets.withdraw")).toBe(true);
  });

  it("requires explicit grants for staff", () => {
    const staff = { role: "admin" as const, permissions: ["users.view"] };
    expect(hasPermission(staff, "users.view")).toBe(true);
    expect(hasPermission(staff, "users.manage")).toBe(false);
    expect(canAccess(staff, { superAdmin: true })).toBe(false);
    expect(canAccess(staff, "authenticated")).toBe(true);
    expect(canAccess(null, "authenticated")).toBe(false);
  });

  it("never offers company withdrawals to staff", () => {
    expect(PERMISSION_INFO["wallets.withdraw"].grantable).toBe(false);
    expect(Object.values(PERMISSION_INFO).filter((p) => p.grantable)).toHaveLength(12);
  });
});
