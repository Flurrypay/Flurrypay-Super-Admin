import { describe, expect, it } from "vitest";

import { resolveDateRange } from "@/components/filters/date-range";
import { accountStates } from "@/features/users/account-state";
import { formatAmount, toDecimalString } from "@/lib/format";

describe("formatAmount", () => {
  it("formats naira without hiding stored precision", () => {
    expect(formatAmount("1500.5", "NGN", { locale: "en-NG" })).toBe("₦1,500.50");
    expect(formatAmount("0.12345678", "NGN", { locale: "en-NG" })).toBe("₦0.12345678");
  });

  it("formats crypto with its ticker and full 8-decimal scale", () => {
    expect(formatAmount("0.00012345", "btc", { locale: "en-NG" })).toBe("0.00012345 BTC");
  });

  it("formats exact decimal strings beyond floating-point precision", () => {
    expect(formatAmount("12345678901234567.12", "NGN", { locale: "en-NG" })).toBe(
      "₦12,345,678,901,234,567.12",
    );
  });

  it("rejects non-numeric input rather than guessing", () => {
    expect(toDecimalString("12abc")).toBeNull();
    expect(formatAmount(null, "NGN")).toBe("—");
  });
});

describe("resolveDateRange (Africa/Lagos)", () => {
  const now = new Date("2026-09-22T10:00:00Z");
  it("starts 'today' at midnight WAT", () => {
    const range = resolveDateRange({ range: "today", from: null, to: null }, now, "Africa/Lagos");
    expect(range?.from.toISOString()).toBe("2026-09-21T23:00:00.000Z");
    expect(range?.to).toEqual(now);
  });

  it("covers the whole previous calendar month", () => {
    const range = resolveDateRange(
      { range: "last-month", from: null, to: null },
      now,
      "Africa/Lagos",
    );
    expect(range?.from.toISOString()).toBe("2026-07-31T23:00:00.000Z");
    expect(range?.to.toISOString()).toBe("2026-08-31T22:59:59.999Z");
  });

  it("rejects inverted custom ranges", () => {
    expect(
      resolveDateRange({ range: "custom", from: "2026-09-10", to: "2026-09-01" }, now),
    ).toBeNull();
  });
});

describe("accountStates", () => {
  const base = {
    isBlocked: false,
    isSuspended: false,
    outboundRestricted: false,
    isConfirmed: true,
    loginLockedUntil: null,
    pinLockedUntil: null,
  };

  it("reports active when nothing applies", () => {
    expect(accountStates(base)).toEqual(["active"]);
  });

  it("orders restrictions by severity and ignores expired locks", () => {
    const now = new Date("2026-09-22T10:00:00Z");
    expect(
      accountStates(
        {
          ...base,
          isSuspended: true,
          isBlocked: true,
          pinLockedUntil: "2026-09-22T09:00:00Z",
          isConfirmed: false,
        },
        now,
      ),
    ).toEqual(["blocked", "suspended", "unconfirmed"]);
  });
});
