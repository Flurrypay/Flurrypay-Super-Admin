import { z } from "zod";

import { isMinorUnits } from "@/lib/money";

/** Trimmed string that must not be empty after trimming. */
export const requiredString = z.string().trim().min(1, "Required");

/** Normalised (trimmed, lower-cased) before the format check runs. */
export const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

export const uuid = z.uuid();

/** UTC ISO-8601 timestamp with an explicit offset, as exchanged with the API. */
export const isoTimestamp = z.iso.datetime({ offset: true });

/** ISO-4217 alphabetic currency code. */
export const currencyCode = z.string().regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO-4217 code");

/** Integer amount in minor units, carried as a string to avoid floating-point loss. */
export const minorUnitAmount = z
  .string()
  .refine(isMinorUnits, "Must be an integer amount in minor units");

export const money = z.object({
  amountMinor: minorUnitAmount,
  currency: currencyCode,
});

export const sortDirection = z.enum(["asc", "desc"]);

/** Pagination input coerced from URL search params. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
