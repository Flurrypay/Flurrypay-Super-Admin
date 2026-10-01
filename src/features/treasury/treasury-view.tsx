"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CoinsIcon, LandmarkIcon, ScaleIcon, TriangleAlertIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { DetailSection } from "@/components/detail/detail-list";
import { DATE_PRESETS, resolveDateRange } from "@/components/filters/date-range";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { SelectFilter } from "@/components/filters/select-filter";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPermission } from "@/features/auth/admin-context";
import { Metric } from "@/features/overview/metric";
import { humanizeEnum } from "@/lib/format";

import {
  type Earning,
  EARNING_TYPES,
  type EarningsBreakdown,
  fetchEarnings,
  fetchEarningsBreakdown,
  fetchLiquidity,
  fetchPayoutProviders,
  type PayoutProvider,
} from "./api";

const BREAKDOWN_ROWS: { key: keyof EarningsBreakdown; label: string }[] = [
  { key: "cryptoBuyCommissions", label: "Crypto buy commissions" },
  { key: "cryptoSaleCommissions", label: "Crypto sale commissions" },
  { key: "swapFees", label: "Swap fees" },
  { key: "transferFees", label: "Transfer fees" },
  { key: "otherEarnings", label: "Other" },
];

/** Liquidity against customer balances, payout accounts and company earnings. */
export function TreasuryView() {
  const canViewUsers = useHasPermission("users.view");
  const [state, setState] = useQueryStates(
    {
      range: parseAsStringLiteral([...DATE_PRESETS, "custom"] as const).withDefault("30d"),
      from: parseAsString,
      to: parseAsString,
      type: parseAsStringLiteral(EARNING_TYPES),
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(25),
    },
    { clearOnDefault: true },
  );
  const range = resolveDateRange({ range: state.range, from: state.from, to: state.to });
  const rangeKey = state.range === "custom" ? `${state.from}..${state.to}` : state.range;
  const period = { startDate: range?.from.toISOString(), endDate: range?.to.toISOString() };

  const liquidity = useQuery({
    queryKey: ["treasury", "liquidity"],
    queryFn: ({ signal }) => fetchLiquidity(signal),
  });
  const providers = useQuery({
    queryKey: ["treasury", "providers"],
    queryFn: ({ signal }) => fetchPayoutProviders(signal),
  });
  const breakdown = useQuery({
    queryKey: ["treasury", "breakdown", rangeKey],
    queryFn: ({ signal }) => fetchEarningsBreakdown(period, signal),
  });
  const earnings = useQuery({
    queryKey: [
      "treasury",
      "earnings",
      { rangeKey, type: state.type, page: state.page, size: state.size },
    ],
    queryFn: ({ signal }) =>
      fetchEarnings(
        { ...period, transactionType: state.type, page: state.page, pageSize: state.size },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const l = liquidity.data;

  const providerColumns: DataColumn<PayoutProvider>[] = [
    {
      id: "name",
      header: "Account",
      required: true,
      cell: (p) => (
        <span className="grid leading-tight">
          <span className="font-medium">{p.name || humanizeEnum(p.provider)}</span>
          <span className="text-xs text-muted-foreground">
            {[p.bankName, p.accountName].filter(Boolean).join(" · ") || humanizeEnum(p.provider)}
          </span>
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      cell: (p) => (
        <span className="flex flex-wrap gap-1">
          {p.isActive && <Badge tone="success">Active</Badge>}
          {p.isDefault && <Badge tone="neutral">Default</Badge>}
          {p.environment && <Badge tone="info">{humanizeEnum(p.environment)}</Badge>}
          {!p.hasApiKey && <Badge tone="warning">Not configured</Badge>}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Cached balance",
      align: "right",
      cell: (p) => <Amount value={p.cachedBalance} currency="NGN" />,
    },
    {
      id: "synced",
      header: "Synced",
      priority: "secondary",
      cell: (p) => <DateTime value={p.lastSyncedAt} />,
    },
  ];

  const earningColumns: DataColumn<Earning>[] = [
    {
      id: "createdAt",
      header: "When",
      required: true,
      cell: (e) => <DateTime value={e.createdAt} />,
    },
    {
      id: "type",
      header: "Type",
      cell: (e) => (
        <span className="grid leading-tight">
          <span>{humanizeEnum(e.transactionType)}</span>
          {e.swapStrategy && (
            <span className="text-xs text-muted-foreground">{e.swapStrategy}</span>
          )}
        </span>
      ),
    },
    {
      id: "crypto",
      header: "Crypto",
      align: "right",
      priority: "secondary",
      cell: (e) =>
        e.coin ? <Amount value={e.cryptoAmount} currency={e.coin} className="font-normal" /> : "—",
    },
    {
      id: "naira",
      header: "Trade value",
      align: "right",
      priority: "secondary",
      cell: (e) => <Amount value={e.nairaAmount} currency="NGN" className="font-normal" />,
    },
    {
      id: "profit",
      header: "Profit",
      align: "right",
      description: "Estimated naira profit recorded when the trade completed.",
      cell: (e) => <Amount value={e.profit} currency="NGN" />,
    },
    {
      id: "reference",
      header: "Reference",
      priority: "tertiary",
      cell: (e) =>
        e.reference ? (
          <Link
            href={`/transactions/${encodeURIComponent(e.reference)}`}
            className="font-mono text-xs hover:underline"
          >
            {e.reference}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "user",
      header: "Customer",
      priority: "tertiary",
      cell: (e) =>
        e.userId && canViewUsers ? (
          <Link href={`/users/${e.userId}`} className="font-mono text-xs hover:underline">
            {e.userId.slice(0, 8)}
          </Link>
        ) : (
          <span className="font-mono text-xs">{e.userId?.slice(0, 8) ?? "—"}</span>
        ),
    },
  ];

  return (
    <div className="grid gap-5">
      {l?.isUnderFunded && (
        <Alert tone="danger">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Settlement balance is below customer balances</AlertTitle>
          <AlertDescription>
            Customers hold more naira than the settlement account. The shortfall is shown under
            Coverage.
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Liquidity" className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Liquidity</h2>
          <Freshness
            updatedAt={liquidity.dataUpdatedAt}
            isFetching={liquidity.isFetching}
            onRefresh={() => void liquidity.refetch()}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric
            label="Settlement balance"
            value={l ? 0 : undefined}
            display={
              <Amount
                value={l?.balance}
                currency={l?.currency ?? "NGN"}
                className="font-semibold"
              />
            }
            icon={LandmarkIcon}
            isPending={liquidity.isPending}
            isError={liquidity.isError}
            definition="Live balance of the settlement account, read from the provider."
          />
          <Metric
            label="Customer balances"
            value={l ? 0 : undefined}
            display={
              <Amount value={l?.totalUserLiability} currency="NGN" className="font-semibold" />
            }
            icon={WalletIcon}
            isPending={liquidity.isPending}
            isError={liquidity.isError}
            definition="Sum of every customer's naira wallet balance: what the company owes customers."
          />
          <Metric
            label="Coverage"
            value={l?.isUnderFunded ? 1 : 0}
            attention
            display={<Amount value={l?.coverage} currency="NGN" signed className="font-semibold" />}
            icon={ScaleIcon}
            isPending={liquidity.isPending}
            isError={liquidity.isError}
            definition="Settlement balance minus customer balances. Negative means under-funded."
          />
        </div>
      </section>

      <DetailSection title="Payout accounts">
        <DataTable
          label="Payout accounts"
          subject="payout accounts"
          columns={providerColumns}
          rows={providers.data ?? []}
          getRowId={(p) => p.id}
          isLoading={providers.isFetching}
          error={providers.error}
          onRetry={() => void providers.refetch()}
          empty={{
            icon: LandmarkIcon,
            title: "No payout accounts",
            description: "Payout providers configured in the API appear here.",
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Switching or configuring providers stays with super admins in the existing tools; this
          view is read-only.
        </p>
      </DetailSection>

      <section aria-label="Earnings" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-medium">Earnings</h2>
          <DateRangeFilter
            value={{ range: state.range, from: state.from, to: state.to }}
            onChange={(value) => void setState({ ...value, range: value.range ?? "30d", page: 1 })}
          />
          <SelectFilter
            label="Type"
            value={state.type}
            options={EARNING_TYPES.map((value) => ({ value, label: humanizeEnum(value) }))}
            onChange={(type) => void setState({ type, page: 1 })}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="rounded-md border bg-card p-4">
            {breakdown.isPending ? (
              <Skeleton className="h-40" />
            ) : breakdown.isError ? (
              <ErrorState
                error={breakdown.error}
                subject="the earnings breakdown"
                onRetry={() => void breakdown.refetch()}
              />
            ) : (
              <dl className="grid gap-2 text-sm">
                {BREAKDOWN_ROWS.map((row) => (
                  <div key={row.key} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd>
                      <Amount
                        value={breakdown.data[row.key]}
                        currency="NGN"
                        className="font-normal"
                      />
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t pt-2 font-medium">
                  <dt className="flex items-center gap-1.5">
                    <CoinsIcon className="size-4 text-muted-foreground" aria-hidden />
                    Total
                  </dt>
                  <dd>
                    <Amount value={breakdown.data.total} currency="NGN" />
                  </dd>
                </div>
                <p className="text-xs text-muted-foreground">
                  Totals are summed by the API in floating point and may differ from an exact sum by
                  a fraction of a kobo.
                </p>
              </dl>
            )}
          </div>

          <div className="grid gap-3">
            <DataTable
              label="Earnings"
              subject="earnings"
              columns={earningColumns}
              rows={earnings.data?.rows ?? []}
              getRowId={(e) => e.id}
              isLoading={earnings.isFetching}
              error={earnings.error}
              onRetry={() => void earnings.refetch()}
              empty={{
                icon: CoinsIcon,
                title: "No earnings in this period",
                description: "Profit recorded on completed buys, sells and swaps appears here.",
              }}
            />
            <Pagination
              page={state.page}
              pageSize={state.size}
              total={earnings.data?.total ?? 0}
              onPageChange={(page) => void setState({ page })}
              onPageSizeChange={(size) => void setState({ size, page: 1 })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
