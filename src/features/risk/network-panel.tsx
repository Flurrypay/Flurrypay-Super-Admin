"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BanknoteIcon,
  GlobeIcon,
  MailIcon,
  NetworkIcon,
  PhoneIcon,
  SearchIcon,
  SmartphoneIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DetailList } from "@/components/detail/detail-list";
import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHasPermission } from "@/features/auth/admin-context";
import { humanizeEnum } from "@/lib/format";

import {
  COUNTERPARTY_TYPES,
  type CounterpartyType,
  type EntityLink,
  fetchCounterparty,
  fetchUserNetwork,
  type LinkedAccount,
} from "./investigation-api";
import { LINK_STRENGTH_TONE, LINK_TYPE_LABEL } from "./labels";

/**
 * Relationships, and what a destination's own history looks like.
 *
 * WHY THIS IS A LIST AND NOT A FORCE-DIRECTED GRAPH
 *
 * A node diagram of an account and its neighbours looks impressive and
 * answers almost nothing: the investigator's question is "who else, and is
 * that normal", and the answer is a named list with a count and a reason it
 * might be innocent. A canvas would make that harder to read, impossible to
 * scan on a laptop under time pressure, and inaccessible to a screen reader.
 * If two-hop exploration is ever genuinely needed, that is the point to
 * reconsider — not before.
 *
 * Every group states what the link does NOT prove. That text is not a
 * disclaimer bolted on: it is the difference between a tool that finds mule
 * networks and one that produces confident conclusions about families who
 * share a phone.
 */

const LINK_ICON: Record<string, typeof NetworkIcon> = {
  SHARED_DEVICE: SmartphoneIcon,
  SHARED_BENEFICIARY: BanknoteIcon,
  SHARED_CRYPTO_DESTINATION: WalletIcon,
  SHARED_IP: GlobeIcon,
  SHARED_PHONE: PhoneIcon,
  SHARED_EMAIL_ROOT: MailIcon,
};

export function NetworkPanel({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const result = useQuery({
    queryKey: ["risk", "network", userId],
    queryFn: ({ signal }) => fetchUserNetwork(userId, 30, signal),
    enabled: Boolean(userId),
  });

  const links = result.data?.links ?? [];

  return (
    <div className="grid gap-3 pt-2">
      {result.isPending && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Looking for connected accounts…
        </p>
      )}
      {result.isError && (
        <EmptyState
          icon={NetworkIcon}
          title="Could not load relationships"
          description="The relationship queries did not complete. Retry, or check the engine health panel."
          action={
            <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {result.data && links.length === 0 && (
        <EmptyState
          icon={NetworkIcon}
          title="No connected accounts"
          description="No other account shares a device, payee, crypto destination, mailbox or recent IP address with this customer."
        />
      )}

      {links.map((link) => (
        <LinkGroup key={`${link.type}-${link.value}`} link={link} />
      ))}

      {result.data && links.length > 0 && (
        <p className="text-xs text-muted-foreground">{result.data.caveat}</p>
      )}

      {!compact && <CounterpartyLookup />}
    </div>
  );
}

function LinkGroup({ link }: { link: EntityLink }) {
  const Icon = LINK_ICON[link.type] ?? NetworkIcon;
  return (
    <section className="grid gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {LINK_TYPE_LABEL[link.type] ?? humanizeEnum(link.type)}
        </span>
        <span className="flex items-center gap-1.5">
          <Badge tone={LINK_STRENGTH_TONE[link.strength] ?? "neutral"}>
            {humanizeEnum(link.strength)} link
          </Badge>
          <Badge tone="neutral">
            <UsersIcon aria-hidden />
            {link.accounts.length + 1}
          </Badge>
        </span>
      </div>
      <p className="font-mono text-xs break-all text-muted-foreground">{link.label}</p>
      <p className="text-xs text-muted-foreground">{link.interpretation}</p>
      <ul className="grid gap-1">
        {link.accounts.map((account) => (
          <AccountRow key={account.userId} account={account} />
        ))}
      </ul>
    </section>
  );
}

function AccountRow({ account }: { account: LinkedAccount }) {
  const canViewUsers = useHasPermission("users.view");
  const name =
    `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim() ||
    account.email ||
    account.userId;
  const state = account.isBlocked
    ? "Blocked"
    : account.isSuspended
      ? "Suspended"
      : account.outboundRestricted
        ? "Outbound restricted"
        : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
      <span className="grid leading-tight">
        {canViewUsers ? (
          <Link href={`/users/${account.userId}`} className="text-sm hover:underline">
            {name}
          </Link>
        ) : (
          <span className="text-sm">{name}</span>
        )}
        <span className="text-xs text-muted-foreground">{account.email ?? account.userId}</span>
      </span>
      {state && <Badge tone="warning">{state}</Badge>}
    </li>
  );
}

/**
 * A destination's own history.
 *
 * The inversion of the customer view: instead of "what did this person do",
 * "who uses this account". That is the question that separates a supplier
 * everyone pays from a collection point.
 */
export function CounterpartyLookup({
  initialType,
  initialValue,
}: {
  initialType?: CounterpartyType;
  initialValue?: string;
} = {}) {
  const [type, setType] = useState<CounterpartyType>(initialType ?? "BANK_ACCOUNT");
  const [value, setValue] = useState(initialValue ?? "");
  const [submitted, setSubmitted] = useState<{ type: CounterpartyType; value: string } | null>(
    initialValue ? { type: initialType ?? "BANK_ACCOUNT", value: initialValue } : null,
  );
  const canViewUsers = useHasPermission("users.view");

  const result = useQuery({
    queryKey: ["risk", "counterparty", submitted?.type, submitted?.value],
    // `enabled` already guarantees a submitted lookup, but the narrowing has to
    // be expressed for the type checker rather than asserted away.
    queryFn: ({ signal }) =>
      submitted
        ? fetchCounterparty(submitted.type, submitted.value, signal)
        : Promise.reject(new Error("No destination selected")),
    enabled: submitted !== null,
  });

  const profile = result.data;

  return (
    <section className="grid gap-3 rounded-md border p-3">
      <h3 className="text-sm font-medium">Look up a destination</h3>
      <p className="text-xs text-muted-foreground">
        Inspecting a destination reveals which customers use it, so the lookup is recorded in the
        audit log.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) setSubmitted({ type, value: value.trim() });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="counterparty-type">Type</Label>
          <Select
            value={type}
            onValueChange={(next) => {
              setType(next as CounterpartyType);
            }}
          >
            <SelectTrigger id="counterparty-type" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTERPARTY_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {humanizeEnum(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="counterparty-value">
            {type === "BANK_ACCOUNT" ? "Account number" : "Wallet address"}
          </Label>
          <Input
            id="counterparty-value"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            placeholder={type === "BANK_ACCOUNT" ? "0123456789" : "0x… or bc1…"}
          />
        </div>
        <Button type="submit" size="sm" disabled={!value.trim()}>
          <SearchIcon aria-hidden />
          Look up
        </Button>
      </form>

      {result.isPending && submitted && (
        <p className="text-sm text-muted-foreground">Looking up this destination…</p>
      )}
      {result.isError && (
        <p className="text-sm text-muted-foreground">
          That destination could not be looked up. Check the value and try again.
        </p>
      )}

      {profile && (
        <div className="grid gap-2 border-t pt-3">
          {profile.watchlisted && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-2.5 text-sm">
              <span className="font-medium">
                On the internal watchlist ({humanizeEnum(profile.watchlistSeverity ?? "")})
              </span>
              <p className="text-xs text-muted-foreground">{profile.watchlistReason}</p>
            </div>
          )}
          <DetailList
            columns={2}
            items={[
              { label: "Destination", value: profile.label ?? profile.entityValue },
              { label: "Customers", value: profile.distinctUsers },
              {
                label: "Times used",
                value: profile.transactionCount,
                hint:
                  profile.entityType === "BANK_ACCOUNT"
                    ? "Recorded uses of this saved payee across all customers. The naira total is not derivable from this record, so it is not shown."
                    : "Transactions recorded against this address.",
              },
              { label: "First seen", value: <DateTime value={profile.firstSeen} /> },
              { label: "Last seen", value: <DateTime value={profile.lastSeen} /> },
            ]}
          />
          {profile.users.length > 0 && (
            <ul className="grid gap-1">
              {profile.users.map((account) => (
                <li
                  key={account.userId}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
                >
                  {canViewUsers ? (
                    <Link href={`/users/${account.userId}`} className="hover:underline">
                      {`${account.firstName ?? ""} ${account.lastName ?? ""}`.trim() ||
                        account.email ||
                        account.userId}
                    </Link>
                  ) : (
                    <span>{account.email ?? account.userId}</span>
                  )}
                  {(account.isBlocked || account.isSuspended || account.outboundRestricted) && (
                    <Badge tone="warning">Restricted</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
