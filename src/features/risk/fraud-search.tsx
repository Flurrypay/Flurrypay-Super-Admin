"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { humanizeEnum } from "@/lib/format";

import { fraudSearch } from "./investigation-api";

/**
 * One box for every identifier an investigation starts from.
 *
 * An investigation begins with whatever the person has — a reference from a
 * complaint, an account number from a bank enquiry, an address from a chain
 * explorer, a case number from an email — and each of those lives on a
 * different screen. This removes the "which screen do I open" step.
 *
 * Deferred rather than debounced: the search is cheap and index-bound on the
 * server, and `useDeferredValue` keeps the input responsive without holding a
 * timer that fires after the investigator has already moved on.
 */

const KIND_TONE: Record<string, "neutral" | "info" | "warning" | "accent"> = {
  USER: "info",
  TRANSACTION: "neutral",
  CASE: "warning",
  ALERT: "warning",
  BANK_ACCOUNT: "neutral",
  WALLET_ADDRESS: "neutral",
  WATCHLIST_ENTRY: "accent",
};

export function FraudSearch() {
  const [term, setTerm] = useState("");
  const deferred = useDeferredValue(term.trim());
  const enabled = deferred.length >= 3;

  const result = useQuery({
    queryKey: ["risk", "search", deferred],
    queryFn: ({ signal }) => fraudSearch(deferred, signal),
    enabled,
  });

  const hits = result.data ?? [];

  return (
    <div className="grid gap-3 pt-2">
      <div className="grid gap-1.5">
        <Label htmlFor="fraud-search">Search</Label>
        <Input
          id="fraud-search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
          }}
          placeholder="Customer id, email, phone, transaction reference, case reference, account number or wallet address"
        />
        <p className="text-xs text-muted-foreground">
          The shape of what you type decides what is searched — a ten-digit number is looked up as a
          bank account, not as a phone number.
        </p>
      </div>

      {!enabled && (
        <EmptyState
          icon={SearchIcon}
          title="Start typing"
          description="At least three characters. Search covers customers, transactions, cases, alerts, destinations and watchlist entries."
        />
      )}

      {enabled && result.isPending && <p className="text-sm text-muted-foreground">Searching…</p>}

      {enabled && !result.isPending && hits.length === 0 && (
        <EmptyState
          icon={SearchIcon}
          title="Nothing found"
          description="No customer, transaction, case, alert, destination or watchlist entry matches that."
        />
      )}

      {hits.length > 0 && (
        <ul className="grid gap-1.5">
          {hits.map((hit) => {
            const row = (
              <span className="flex w-full flex-wrap items-center justify-between gap-2">
                <span className="grid leading-tight">
                  <span className="text-sm">{hit.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {hit.subtitle ?? `Matched on ${hit.matchedOn}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {hit.badge && <Badge tone="neutral">{hit.badge}</Badge>}
                  <Badge tone={KIND_TONE[hit.kind] ?? "neutral"}>{humanizeEnum(hit.kind)}</Badge>
                </span>
              </span>
            );

            return (
              <li key={`${hit.kind}-${hit.id}`}>
                {hit.href ? (
                  <Link
                    href={hit.href as Route}
                    className="flex rounded-md border px-3 py-2 transition-colors hover:bg-muted"
                  >
                    {row}
                  </Link>
                ) : (
                  <span className="flex rounded-md border px-3 py-2">{row}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
