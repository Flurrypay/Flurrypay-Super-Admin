import { localeConfig } from "@/config/locale";

/**
 * Monetary amounts are integer minor units (e.g. kobo, cents) paired with an
 * ISO-4217 currency code. They travel as strings so values beyond
 * Number.MAX_SAFE_INTEGER survive JSON, and are handled as `bigint` in code.
 *
 * Never convert amounts to floating-point numbers. If decimal arithmetic
 * (FX, percentages, rounding rules) becomes necessary, introduce a decimal
 * library rather than using `number`.
 */
export interface Money {
  /** Integer amount in the currency's minor unit, as a decimal string, e.g. "150075". */
  amountMinor: string;
  /** ISO-4217 code, e.g. "NGN". */
  currency: string;
}

const MINOR_UNITS_PATTERN = /^-?\d+$/;

export function isMinorUnits(value: string): boolean {
  return MINOR_UNITS_PATTERN.test(value);
}

/** Number of minor-unit digits for a currency (NGN → 2, JPY → 0), as defined by ICU. */
export function getCurrencyExponent(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** Exact decimal string for the major-unit value, e.g. ("150075", "NGN") → "1500.75". */
export function minorToMajorString(amountMinor: string, currency: string): string {
  if (!isMinorUnits(amountMinor)) {
    throw new RangeError(`Invalid minor-unit amount: "${amountMinor}"`);
  }

  const exponent = getCurrencyExponent(currency);
  const value = BigInt(amountMinor);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(exponent + 1, "0");
  const integerPart = digits.slice(0, digits.length - exponent);
  const fractionPart = exponent > 0 ? `.${digits.slice(-exponent)}` : "";

  return `${negative ? "-" : ""}${integerPart}${fractionPart}`;
}

/** Locale-aware currency display without any floating-point conversion. */
export function formatMoney(
  { amountMinor, currency }: Money,
  locale: string = localeConfig.defaultLocale,
): string {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  // Intl formats decimal strings exactly, preserving precision a number would lose.
  return formatter.format(minorToMajorString(amountMinor, currency) as `${number}`);
}
