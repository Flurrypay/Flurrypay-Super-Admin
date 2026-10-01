"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  ArrowLeftRightIcon,
  CircleHelpIcon,
  LoaderCircleIcon,
  SearchIcon,
  ShieldUserIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Amount } from "@/components/format/amount";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import type { NavItem } from "@/config/navigation";
import { globalSearch, SEARCH_MIN } from "@/features/search/api";
import { transactionTypeLabel } from "@/features/transactions/labels";
import { userDisplayName } from "@/features/users/queries";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly NavItem[];
  onOpenHelp: () => void;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

/**
 * Global search (⌘K): pages locally, plus users, wallet addresses, transaction
 * references and administrators from the API's search endpoint, limited to
 * what the signed-in admin may view.
 */
export function CommandPalette({ open, onOpenChange, items, onOpenHelp }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const debounced = useDebounced(query.trim(), 250);

  const search = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: ({ signal }) => globalSearch(debounced, signal),
    enabled: open && debounced.length >= SEARCH_MIN.any,
    staleTime: 30_000,
  });
  const found = debounced.length >= SEARCH_MIN.any ? search.data : undefined;

  const pageMatches = items.filter(
    (item) =>
      !term ||
      item.label.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term),
  );

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href as Route);
  }

  const loading = search.isFetching && debounced.length >= SEARCH_MIN.any;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, customers, wallet addresses, transaction references and administrators.
        </DialogDescription>
        <Command shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search customers, references, addresses, pages…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && (
              <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-hidden />
            )}
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {term.length > 0 && term.length < 2
                ? "Keep typing…"
                : `No matches. References need at least ${SEARCH_MIN.transactions} characters and wallet addresses ${SEARCH_MIN.walletAddresses}.`}
            </Command.Empty>

            {(found?.users?.length ?? 0) > 0 && (
              <Command.Group heading="Customers">
                {found?.users?.map((user) => (
                  <PaletteItem
                    key={user.id}
                    value={`user-${user.id}`}
                    onSelect={() => {
                      go(`/users/${user.id}`);
                    }}
                  >
                    <UserIcon aria-hidden />
                    <span className="truncate">{userDisplayName(user)}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
            )}

            {(found?.walletAddresses?.length ?? 0) > 0 && (
              <Command.Group heading="Wallet addresses">
                {found?.walletAddresses?.map((wallet) => (
                  <PaletteItem
                    key={wallet.id}
                    value={`wallet-${wallet.id}`}
                    onSelect={() => {
                      go(`/users/${wallet.userId}?tab=wallets`);
                    }}
                  >
                    <WalletIcon aria-hidden />
                    <span className="truncate font-mono text-xs">{wallet.address}</span>
                    <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                      {[wallet.currency, wallet.network].filter(Boolean).join(" · ")}
                      {wallet.user && ` · ${userDisplayName(wallet.user)}`}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
            )}

            {(found?.transactions?.length ?? 0) > 0 && (
              <Command.Group heading="Transactions">
                {found?.transactions?.map((tx) => (
                  <PaletteItem
                    key={tx.id}
                    value={`tx-${tx.id}`}
                    onSelect={() => {
                      go(
                        tx.reference
                          ? `/transactions/${encodeURIComponent(tx.reference)}`
                          : `/transactions?q=${encodeURIComponent(debounced)}`,
                      );
                    }}
                  >
                    <ArrowLeftRightIcon aria-hidden />
                    <span className="truncate font-mono text-xs">{tx.reference ?? tx.id}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {transactionTypeLabel(tx.transactionType)}
                    </span>
                    <Amount value={tx.amount} currency={tx.currency} className="ml-auto text-xs" />
                  </PaletteItem>
                ))}
              </Command.Group>
            )}

            {(found?.admins?.length ?? 0) > 0 && (
              <Command.Group heading="Administrators">
                {found?.admins?.map((admin) => (
                  <PaletteItem
                    key={admin.id}
                    value={`admin-${admin.id}`}
                    onSelect={() => {
                      go(`/administrators/${admin.id}`);
                    }}
                  >
                    <ShieldUserIcon aria-hidden />
                    <span className="truncate">{userDisplayName(admin)}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {admin.email}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
            )}

            {pageMatches.length > 0 && (
              <Command.Group heading="Pages">
                {pageMatches.map((item) => {
                  const Icon = item.icon;
                  return (
                    <PaletteItem
                      key={item.id}
                      value={`page-${item.id}`}
                      onSelect={() => {
                        go(item.href);
                      }}
                    >
                      <Icon aria-hidden />
                      {item.label}
                      <span className="ml-auto flex gap-0.5" aria-hidden>
                        <Kbd>G</Kbd>
                        <Kbd>{item.shortcut.toUpperCase()}</Kbd>
                      </span>
                    </PaletteItem>
                  );
                })}
              </Command.Group>
            )}

            {(!term || "help shortcuts".includes(term)) && (
              <Command.Group heading="Help">
                <PaletteItem
                  value="help"
                  onSelect={() => {
                    onOpenChange(false);
                    onOpenHelp();
                  }}
                >
                  <CircleHelpIcon aria-hidden />
                  Help & keyboard shortcuts
                  <Kbd className="ml-auto">?</Kbd>
                </PaletteItem>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteItem({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2 text-sm select-none data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {children}
    </Command.Item>
  );
}
