import { localeConfig } from "@/config/locale";

/**
 * Display formatting for amounts as the API delivers them: decimal strings
 * (Postgres `decimal` without a transformer) or JS numbers (with one).
 * Values are never used in arithmetic here. Intl formats the decimal string
 * exactly, and fraction digits are never capped below what the column
 * stores, so nothing is silently rounded.
 */

/** Maximum scale stored by the API's amount columns (`decimal(20,8)`). */
const MAX_FRACTION_DIGITS = 8;

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i;

let isoCurrencies: Set<string> | undefined;

function isIsoCurrency(code: string): boolean {
  isoCurrencies ??= new Set(Intl.supportedValuesOf("currency"));
  return isoCurrencies.has(code.toUpperCase());
}

/** Normalises an API amount to a numeric string, or null when absent or malformed. */
export function toDecimalString(value: unknown): `${number}` | null {
  if (typeof value === "number")
    return Number.isFinite(value) ? (String(value) as `${number}`) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return NUMERIC_PATTERN.test(trimmed) ? (trimmed as `${number}`) : null;
}

export function isNegativeAmount(value: unknown): boolean {
  return toDecimalString(value)?.startsWith("-") ?? false;
}

interface FormatAmountOptions {
  locale?: string;
  /** Prefix positive values with "+" (for signed ledgers). */
  signed?: boolean;
}

/**
 * Formats an amount in its own currency. ISO currencies (NGN, USD) use currency
 * style; crypto assets use plain grouping followed by the ticker.
 */
export function formatAmount(
  value: unknown,
  currency: string | null | undefined,
  { locale = localeConfig.defaultLocale, signed = false }: FormatAmountOptions = {},
): string {
  const decimal = toDecimalString(value);
  if (decimal === null) return "—";

  const code = currency?.trim().toUpperCase();
  const signDisplay = signed ? "exceptZero" : "auto";

  if (code && isIsoCurrency(code)) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: MAX_FRACTION_DIGITS,
      signDisplay,
    }).format(decimal);
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: MAX_FRACTION_DIGITS,
    signDisplay,
  }).format(decimal);
  return code ? `${formatted} ${code}` : formatted;
}

/** Integer counts with grouping, e.g. 12,408. */
export function formatCount(value: number, locale: string = localeConfig.defaultLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** Masks all but the last `visible` characters, e.g. "•••••••4821". */
export function maskIdentifier(value: string | null | undefined, visible = 4): string {
  if (!value) return "—";
  if (value.length <= visible) return "•".repeat(value.length);
  return `${"•".repeat(Math.min(value.length - visible, 7))}${value.slice(-visible)}`;
}

/** Shortens long opaque identifiers for display: "3f2a9c…e81b". */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Converts SCREAMING_SNAKE or camelCase enum values into readable labels. */
export function humanizeEnum(value: string): string {
  const spaced = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
