import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal } from "@/lib/api/schema-helpers";

const base = `${adminPaths.companyDetails}/rates`;

const ratesSchema = z.object({
  /** NGN per 1 USD charged when customers buy. */
  buyRate: decimal,
  /** NGN per 1 USD paid when customers sell. */
  sellRate: decimal,
  buyMarkupPercent: decimal,
  sellMarkdownPercent: decimal,
  swapFeePercent: decimal,
  liveQuidaxRates: z
    .object({
      usdtNgn: z.object({
        last: decimal,
        buy: decimal,
        sell: decimal,
        high: decimal,
        low: decimal,
      }),
    })
    .nullish()
    .catch(null),
});
export type Rates = z.output<typeof ratesSchema>;

export function fetchRates(signal?: AbortSignal) {
  return adminApi.get(base, { schema: ratesSchema, signal, timeoutMs: 30_000 });
}

export interface RatesUpdate {
  buyRate?: number;
  sellRate?: number;
  buyMarkupPercent?: number;
  sellMarkdownPercent?: number;
  swapFeePercent?: number;
  twoFACode: string;
}

/** Limits enforced by the API. */
export const RATE_LIMITS = {
  buyMarkupPercent: { min: 0, max: 20 },
  sellMarkdownPercent: { min: 0, max: 20 },
  swapFeePercent: { min: 0, max: 1 },
} as const;

/** Changes customer pricing immediately and notifies every customer (settings.manage + 2FA). */
export function updateRates(input: RatesUpdate) {
  return adminApi.patch(base, input);
}
