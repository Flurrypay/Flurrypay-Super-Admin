"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CoinsIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  ScaleIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react";
import { useState } from "react";

import { DetailSection } from "@/components/detail/detail-list";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/features/auth/admin-context";
import { isSuperAdmin } from "@/features/auth/permissions";

import { fetchUserWalletLedger, fetchUserWallets, type UserDetail, type UserWallet } from "./api";
import {
  type AdjustmentAssetType,
  type AdjustmentDirection,
  WalletAdjustmentDialog,
} from "./wallet-adjustment-dialog";

interface AdjustmentState {
  direction: AdjustmentDirection;
  assetType: AdjustmentAssetType;
  coinTicker?: string;
}

export function UserWallets({ user }: { user: UserDetail }) {
  const admin = useAdmin();
  // The API gates adjustment endpoints on super admin and refuses to make
  // the permission grantable to invited staff, so there is no permission to
  // check — only the role.
  const canAdjust = isSuperAdmin(admin);
  const [adjustment, setAdjustment] = useState<AdjustmentState | null>(null);

  const walletsQuery = useQuery({
    queryKey: ["user-wallets", user.id],
    queryFn: ({ signal }) => fetchUserWallets(user.id, signal),
  });

  const cryptoWallets = walletsQuery.data ?? [];

  return (
    <div className="grid gap-4">
      <NairaWallet
        user={user}
        cryptoWallets={cryptoWallets}
        canAdjust={canAdjust}
        onAdjust={setAdjustment}
      />
      <CryptoWallets walletsQuery={walletsQuery} canAdjust={canAdjust} onAdjust={setAdjustment} />

      {canAdjust && adjustment !== null && (
        <WalletAdjustmentDialog
          key={`${adjustment.direction}-${adjustment.assetType}-${adjustment.coinTicker ?? ""}`}
          user={user}
          direction={adjustment.direction}
          initialAssetType={adjustment.assetType}
          initialCoinTicker={adjustment.coinTicker}
          wallets={cryptoWallets}
          open
          onOpenChange={(next) => {
            if (!next) setAdjustment(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The naira wallet, with the ledger behind it.
 *
 * The ledger is shown next to the adjustment buttons deliberately. Every entry
 * records the balance either side of the movement, so a discontinuity between
 * consecutive rows means a balance change that bypassed the ledger — and that is
 * the thing to understand BEFORE correcting a balance by hand, because adjusting
 * on top of an unexplained gap buries the evidence of how it got there.
 */
function NairaWallet({
  user,
  cryptoWallets,
  canAdjust,
  onAdjust,
}: {
  user: UserDetail;
  cryptoWallets: UserWallet[];
  canAdjust: boolean;
  onAdjust: (state: AdjustmentState) => void;
}) {
  const ledger = useQuery({
    queryKey: ["user-wallet-ledger", user.id],
    queryFn: ({ signal }) => fetchUserWalletLedger(user.id, 25, signal),
  });

  // Fallback list of crypto wallets from user.coinBalances while full wallets query loads
  const quickCryptoList =
    cryptoWallets.length > 0
      ? cryptoWallets.map((w) => ({
          ticker: w.coinTicker,
          name: w.coinName,
          balance: w.coinBalance.cryptoBalance,
        }))
      : user.coinBalances.map((c) => ({
          ticker: c.ticker,
          name: c.name,
          balance: c.cryptoBalance,
        }));

  return (
    <DetailSection
      title="Naira wallet"
      description="Balance as recorded on the account, and the movements behind it."
      actions={
        canAdjust ? (
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <PlusCircleIcon aria-hidden />
                  Credit
                  <ChevronDownIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Fiat wallet</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    onAdjust({ direction: "credit", assetType: "fiat" });
                  }}
                >
                  <WalletIcon aria-hidden />
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span>Credit Fiat (NGN)</span>
                    <Amount
                      value={user.walletBalance}
                      currency="NGN"
                      className="text-xs text-muted-foreground"
                    />
                  </span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Crypto wallets</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    onAdjust({ direction: "credit", assetType: "crypto" });
                  }}
                >
                  <CoinsIcon aria-hidden />
                  <span>Credit Crypto Wallet…</span>
                </DropdownMenuItem>
                {quickCryptoList.map((coin) => (
                  <DropdownMenuItem
                    key={`credit-${coin.ticker}`}
                    onSelect={() => {
                      onAdjust({
                        direction: "credit",
                        assetType: "crypto",
                        coinTicker: coin.ticker,
                      });
                    }}
                  >
                    <PlusCircleIcon aria-hidden />
                    <span className="flex flex-1 items-center justify-between gap-2">
                      <span>Credit {coin.ticker}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {coin.balance} {coin.ticker}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MinusCircleIcon aria-hidden />
                  Debit
                  <ChevronDownIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Fiat wallet</DropdownMenuLabel>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    onAdjust({ direction: "debit", assetType: "fiat" });
                  }}
                >
                  <WalletIcon aria-hidden />
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span>Debit Fiat (NGN)</span>
                    <Amount
                      value={user.walletBalance}
                      currency="NGN"
                      className="text-xs opacity-80"
                    />
                  </span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Crypto wallets</DropdownMenuLabel>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    onAdjust({ direction: "debit", assetType: "crypto" });
                  }}
                >
                  <CoinsIcon aria-hidden />
                  <span>Debit Crypto Wallet…</span>
                </DropdownMenuItem>
                {quickCryptoList.map((coin) => (
                  <DropdownMenuItem
                    key={`debit-${coin.ticker}`}
                    variant="destructive"
                    onSelect={() => {
                      onAdjust({
                        direction: "debit",
                        assetType: "crypto",
                        coinTicker: coin.ticker,
                      });
                    }}
                  >
                    <MinusCircleIcon aria-hidden />
                    <span className="flex flex-1 items-center justify-between gap-2">
                      <span>Debit {coin.ticker}</span>
                      <span className="font-mono text-xs opacity-80">
                        {coin.balance} {coin.ticker}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="grid">
            <span className="text-xs text-muted-foreground">Balance</span>
            <Amount value={user.walletBalance} currency="NGN" className="text-xl font-semibold" />
          </span>
          <span className="grid">
            <span className="text-xs text-muted-foreground">Referral balance</span>
            <Amount value={user.referralBalance} currency="NGN" />
          </span>
          <span className="grid">
            <span className="text-xs text-muted-foreground">Welcome bonus</span>
            <Amount value={user.welcomeBonus} currency="NGN" />
          </span>
          {user.outboundRestricted && (
            <Badge tone="warning">
              <TriangleAlertIcon aria-hidden />
              Outgoing transfers paused
            </Badge>
          )}
        </div>

        {/*
          Shown before the entries, not after: "this balance does not add up" is
          the single most important thing on this panel, and it must not be
          something the admin discovers by scrolling.
        */}
        {ledger.data && !ledger.data.reconciles && (
          <Alert tone="danger">
            <ScaleIcon aria-hidden />
            <AlertTitle>This wallet does not reconcile</AlertTitle>
            <AlertDescription>
              {ledger.data.gaps.length} discontinuit
              {ledger.data.gaps.length === 1 ? "y" : "ies"} in the ledger: a balance change that was
              never recorded here. Find out how that happened before adjusting the balance by hand.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Newest 25 movements. Append-only — a correction is a new entry, never an edit.
            </p>
            <Freshness
              updatedAt={ledger.dataUpdatedAt}
              isFetching={ledger.isFetching}
              onRefresh={() => void ledger.refetch()}
            />
          </div>

          {ledger.isPending && <Skeleton className="h-32" />}
          {ledger.isError && (
            <ErrorState
              error={ledger.error}
              subject="the wallet ledger"
              onRetry={() => void ledger.refetch()}
              className="py-6"
            />
          )}
          {ledger.isSuccess && ledger.data.entries.length === 0 && (
            <p className="rounded-md border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              No ledger entries. Either the account has never moved naira, or its movements predate
              the ledger.
            </p>
          )}
          {ledger.data && ledger.data.entries.length > 0 && (
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm" aria-label="Naira wallet ledger">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      When
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Source
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Balance before
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Amount
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Balance after
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.data.entries.map((entry) => (
                    <tr key={entry.id} className="border-t align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <DateTime value={entry.createdAt} />
                      </td>
                      <td className="px-3 py-2">
                        <span className="grid leading-tight">
                          <span>{entry.source}</span>
                          {entry.narration && (
                            <span className="max-w-80 truncate text-xs text-muted-foreground">
                              {entry.narration}
                            </span>
                          )}
                          {entry.reference && (
                            <Identifier value={entry.reference} truncate label="reference" />
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                        <Amount
                          value={entry.balanceBefore}
                          currency="NGN"
                          className="font-normal"
                        />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span
                          className={
                            entry.direction === "CREDIT" ? "text-success" : "text-foreground"
                          }
                        >
                          {entry.direction === "CREDIT" ? "+" : "−"}
                          <Amount value={entry.amountNaira} currency="NGN" />
                          <span className="sr-only">
                            {entry.direction === "CREDIT" ? " credit" : " debit"}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                        <Amount value={entry.balanceAfter} currency="NGN" className="font-normal" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DetailSection>
  );
}

function CryptoWallets({
  walletsQuery,
  canAdjust,
  onAdjust,
}: {
  walletsQuery: ReturnType<typeof useQuery<UserWallet[]>>;
  canAdjust: boolean;
  onAdjust: (state: AdjustmentState) => void;
}) {
  if (walletsQuery.isPending) return <Skeleton className="h-48" />;
  if (walletsQuery.isError)
    return (
      <ErrorState
        error={walletsQuery.error}
        subject="wallets"
        onRetry={() => void walletsQuery.refetch()}
      />
    );
  if (walletsQuery.data.length === 0) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="No crypto wallets"
        description="Wallets are created when the customer first uses a crypto feature."
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Crypto balances are the API&apos;s display values; naira values are estimates at the
          current rate.
        </p>
        <Freshness
          updatedAt={walletsQuery.dataUpdatedAt}
          isFetching={walletsQuery.isFetching}
          onRefresh={() => void walletsQuery.refetch()}
        />
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm" aria-label="Wallets">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Asset
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Balance
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Naira estimate
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Deposit addresses
              </th>
              {canAdjust && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {walletsQuery.data.map((wallet) => (
              <tr key={wallet.coinTicker} className="border-t align-top">
                <td className="px-3 py-2">
                  <span className="font-medium">{wallet.coinTicker}</span>
                  <span className="block text-xs text-muted-foreground">{wallet.coinName}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  {wallet.balanceUnavailable ? (
                    <Badge tone="warning">Unavailable</Badge>
                  ) : (
                    <Amount value={wallet.coinBalance.cryptoBalance} currency={wallet.coinTicker} />
                  )}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  <Amount
                    value={wallet.coinBalance.nairaBalance}
                    currency="NGN"
                    className="font-normal"
                  />
                </td>
                <td className="px-3 py-2">
                  <ul className="grid gap-1">
                    {wallet.networks
                      .filter((n) => n.address)
                      .map((network) => (
                        <li key={network.id} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">
                            {network.network ?? "—"}
                          </span>
                          <Identifier
                            value={network.address}
                            truncate
                            label={`${wallet.coinTicker} address`}
                          />
                        </li>
                      ))}
                  </ul>
                </td>
                {canAdjust && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          onAdjust({
                            direction: "credit",
                            assetType: "crypto",
                            coinTicker: wallet.coinTicker,
                          });
                        }}
                      >
                        <PlusCircleIcon aria-hidden />
                        Credit
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          onAdjust({
                            direction: "debit",
                            assetType: "crypto",
                            coinTicker: wallet.coinTicker,
                          });
                        }}
                      >
                        <MinusCircleIcon aria-hidden />
                        Debit
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
