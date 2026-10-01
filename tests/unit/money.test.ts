import { describe, expect, it } from "vitest";

import { formatMoney, minorToMajorString } from "@/lib/money";

describe("minorToMajorString", () => {
  it("converts using the currency exponent without floating point", () => {
    expect(minorToMajorString("150075", "NGN")).toBe("1500.75");
    expect(minorToMajorString("5", "USD")).toBe("0.05");
    expect(minorToMajorString("-5", "USD")).toBe("-0.05");
    expect(minorToMajorString("1500", "JPY")).toBe("1500");
  });

  it("preserves precision beyond Number.MAX_SAFE_INTEGER", () => {
    expect(minorToMajorString("900719925474099312", "USD")).toBe("9007199254740993.12");
  });

  it("rejects non-integer input", () => {
    expect(() => minorToMajorString("10.5", "USD")).toThrow(RangeError);
  });
});

describe("formatMoney", () => {
  it("formats with the requested locale", () => {
    expect(formatMoney({ amountMinor: "123456", currency: "USD" }, "en-US")).toBe("$1,234.56");
  });
});
