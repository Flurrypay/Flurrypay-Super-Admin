"use client";

import { useQuery } from "@tanstack/react-query";
import { WalletIcon } from "lucide-react";

import { Amount } from "@/components/format/amount";
import { Identifier } from "@/components/format/identifier";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { fetchUserWallets } from "./api";

export function UserWallets({ userId }: { userId: string }) {
  const result = useQuery({
    queryKey: ["user-wallets", userId],
    queryFn: ({ signal }) => fetchUserWallets(userId, signal),
  });

  if (result.isPending) return <Skeleton className="h-48" />;
  if (result.isError)
    return (
      <ErrorState error={result.error} subject="wallets" onRetry={() => void result.refetch()} />
    );
  if (result.data.length === 0) {
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
          updatedAt={result.dataUpdatedAt}
          isFetching={result.isFetching}
          onRefresh={() => void result.refetch()}
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
            </tr>
          </thead>
          <tbody>
            {result.data.map((wallet) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
