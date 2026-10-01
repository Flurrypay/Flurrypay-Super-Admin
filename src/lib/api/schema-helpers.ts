import { z } from "zod";

import { toDecimalString } from "@/lib/format";

/**
 * Tolerant field parsers for an API whose JSON types vary by column (decimals
 * arrive as strings or numbers; optional fields as null, undefined or absent).
 * A missing or malformed optional field degrades to null rather than failing
 * the whole response, so one bad row cannot blank a page. `.optional()` before
 * each transform is what makes Zod treat an absent key as allowed.
 */

/** Decimal amount as an exact numeric string, or null. */
export const decimal = z
  .unknown()
  .optional()
  .transform((value) => toDecimalString(value));

export const nullableString = z
  .unknown()
  .optional()
  .transform((value) => (typeof value === "string" && value.length > 0 ? value : null));

/** ISO timestamp string, or null when absent or unparseable. */
export const timestamp = z
  .unknown()
  .optional()
  .transform((value) => {
    if (typeof value !== "string" && !(value instanceof Date)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  });
