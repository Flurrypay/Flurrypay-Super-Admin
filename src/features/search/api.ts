import { z } from "zod";

import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { decimal, nullableString, timestamp } from "@/lib/api/schema-helpers";

const person = {
  email: z.string().catch(""),
  firstName: z.string().catch(""),
  lastName: z.string().catch(""),
};

const searchResultSchema = z.object({
  users: z
    .array(
      z.object({
        id: z.string(),
        ...person,
        userName: nullableString,
        phoneNumber: nullableString,
      }),
    )
    .optional(),
  walletAddresses: z
    .array(
      z.object({
        id: z.string(),
        currency: nullableString,
        network: nullableString,
        address: z.string(),
        userId: z.string(),
        user: z.object(person).nullish(),
      }),
    )
    .optional(),
  transactions: z
    .array(
      z.object({
        id: z.string(),
        reference: nullableString,
        transactionType: z.string().catch(""),
        status: z.string().catch(""),
        amount: decimal,
        currency: nullableString,
        createdAt: timestamp,
        user: z.object({ id: z.string(), email: z.string().catch("") }).nullish(),
      }),
    )
    .optional(),
  admins: z.array(z.object({ id: z.string(), ...person, role: z.string().catch("") })).optional(),
});
export type SearchResult = z.output<typeof searchResultSchema>;

/** Minimum characters per section, as enforced by the API. */
export const SEARCH_MIN = { any: 2, transactions: 4, walletAddresses: 6 } as const;

/**
 * Cross-entity search (`GET /search`). The API only returns sections the
 * signed-in admin may view: users and wallet addresses need `users.view`,
 * transactions `transactions.view`, administrators super admin.
 */
export function globalSearch(q: string, signal?: AbortSignal) {
  return adminApi.get(`${adminPaths.core}/search`, {
    query: { q },
    schema: searchResultSchema,
    signal,
  });
}
