"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRightIcon,
  CoinsIcon,
  PlusCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/features/auth/admin-context";
import { isSuperAdmin } from "@/features/auth/permissions";
import { getUserMessage } from "@/lib/api/errors";

import { type CryptoReserve, fetchCryptoReserves, syncCryptoReserves } from "./api";
import { TopUpDialog } from "./top-up-dialog";
import { WithdrawDialog } from "./withdraw-dialog";

/**
 * The company's crypto reserves: what we hold, and the two ways it moves.
 *
 * Balances come from the exchange on every load, so this is the slowest panel
 * on the page — which is why it is a tab rather than part of the summary, and
 * why a coin the exchange would not answer for is marked unavailable instead of
 * being shown as zero. A zero reserve and an unanswered one look identical on
 * screen and mean opposite things.
 */
export function ReservesPanel() {
  const admin = useAdmin();
  // The API refuses a withdrawal to anyone without `wallets.withdraw`, which is
  // excluded from the staff-grantable set entirely — so only a super admin can
  // ever pass it, and showing the button to anyone else is an invitation to a
  // refusal.
  const canWithdraw = isSuperAdmin(admin);
  const queryClient = useQueryClient();
  const [topUp, setTopUp] = useState<CryptoReserve | null>(null);
  const [withdrawFrom, setWithdrawFrom] = useState<string | null>(null);

  const reserves = useQuery({
    queryKey: ["treasury", "reserves"],
    queryFn: ({ signal }) => fetchCryptoReserves(signal),
  });

  const sync = useMutation({
    mutationFn: syncCryptoReserves,
    onSuccess: () => {
      toast.success("Reserve balances re-read from the exchange");
      void queryClient.invalidateQueries({ queryKey: ["treasury", "reserves"] });
    },
    onError: (err) => toast.error(getUserMessage(err)),
  });

  const rows = reserves.data ?? [];

  const columns: DataColumn<CryptoReserve>[] = [
    {
      id: "asset",
      header: "Asset",
      required: true,
      cell: (r) => (
        <span className="grid leading-tight">
          <span className="font-medium">{r.coinTicker}</span>
          <span className="text-xs text-muted-foreground">{r.coinName}</span>
        </span>
      ),
      exportValue: (r) => r.coinTicker,
    },
    {
      id: "balance",
      header: "Held",
      align: "right",
      cell: (r) =>
        r.balanceUnavailable ? (
          <Badge tone="warning">Unavailable</Badge>
        ) : (
          <Amount value={r.coinBalance.cryptoBalance} currency={r.coinTicker} />
        ),
      exportValue: (r) => (r.balanceUnavailable ? "" : r.coinBalance.cryptoBalance),
    },
    {
      id: "naira",
      header: "Naira estimate",
      align: "right",
      description:
        "Priced at the company's current rate when the page loaded. An estimate, not a settled value.",
      cell: (r) => (
        <Amount value={r.coinBalance.nairaBalance} currency="NGN" className="font-normal" />
      ),
      exportValue: (r) => r.coinBalance.nairaBalance,
    },
    {
      id: "networks",
      header: "Networks",
      priority: "secondary",
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.networks.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            r.networks.map((network) => (
              <Badge key={network.id} tone={network.withdrawsEnabled ? "neutral" : "warning"}>
                {network.network ?? network.networkId}
                {!network.withdrawsEnabled && " · deposits only"}
              </Badge>
            ))
          )}
        </span>
      ),
      exportValue: (r) => r.networks.map((n) => n.network).join(", "),
    },
    {
      id: "address",
      header: "Deposit address",
      priority: "tertiary",
      defaultHidden: true,
      cell: (r) => <Identifier value={r.networks[0]?.address ?? null} truncate label="address" />,
      exportValue: (r) => r.networks[0]?.address,
    },
    {
      id: "updated",
      header: "Read",
      priority: "tertiary",
      cell: (r) => <DateTime value={r.coinBalance.lastUpdated} format="relative" />,
      exportValue: (r) => r.coinBalance.lastUpdated,
    },
    {
      id: "actions",
      header: "",
      required: true,
      align: "right",
      cell: (r) => (
        <span className="flex justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTopUp(r);
            }}
          >
            <PlusCircleIcon aria-hidden />
            Top up
          </Button>
          {canWithdraw && (
            <Button
              variant="outline"
              size="sm"
              disabled={!r.networks.some((n) => n.withdrawsEnabled)}
              onClick={() => {
                setWithdrawFrom(r.coinTicker);
              }}
            >
              <ArrowUpRightIcon aria-hidden />
              Withdraw
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Read live from the exchange. Naira figures are estimates at the current rate.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Freshness
            updatedAt={reserves.dataUpdatedAt}
            isFetching={reserves.isFetching}
            onRefresh={() => void reserves.refetch()}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={sync.isPending}
            onClick={() => {
              sync.mutate();
            }}
          >
            <RefreshCwIcon aria-hidden />
            {sync.isPending ? "Syncing…" : "Sync from exchange"}
          </Button>
          {canWithdraw && rows.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                setWithdrawFrom(rows[0]?.coinTicker ?? null);
              }}
            >
              <ArrowUpRightIcon aria-hidden />
              Withdraw
            </Button>
          )}
        </div>
      </div>

      {rows.some((r) => r.balanceUnavailable) && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Some balances could not be read from the exchange. Those reserves are marked unavailable
          rather than shown as zero — a withdrawal from one may still fail for lack of funds.
        </p>
      )}

      <DataTable
        label="Crypto reserves"
        subject="crypto reserves"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.coinTicker}
        isLoading={reserves.isFetching}
        error={reserves.error}
        onRetry={() => void reserves.refetch()}
        empty={{
          icon: CoinsIcon,
          title: "No crypto reserves",
          description:
            "The company's exchange wallets appear here once they exist upstream. Press Sync if you expect one.",
        }}
      />

      {topUp && (
        <TopUpDialog
          key={topUp.coinTicker}
          target={{ kind: "crypto", reserve: topUp }}
          open
          onOpenChange={(next) => {
            if (!next) setTopUp(null);
          }}
        />
      )}

      {canWithdraw && withdrawFrom && (
        <WithdrawDialog
          key={withdrawFrom}
          reserves={rows}
          initialTicker={withdrawFrom}
          open
          onOpenChange={(next) => {
            if (!next) setWithdrawFrom(null);
          }}
        />
      )}
    </div>
  );
}
