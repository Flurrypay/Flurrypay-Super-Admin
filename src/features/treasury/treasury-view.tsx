"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRightIcon,
  CoinsIcon,
  LandmarkIcon,
  ScaleIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { DATE_PRESETS, resolveDateRange } from "@/components/filters/date-range";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { SelectFilter } from "@/components/filters/select-filter";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/features/auth/admin-context";
import { Metric } from "@/features/overview/metric";
import { humanizeEnum } from "@/lib/format";

import { AccountsPanel } from "./accounts-panel";
import {
  type CryptoReserve,
  type Earning,
  EARNING_TYPES,
  type EarningsBreakdown,
  fetchCryptoReserves,
  fetchEarnings,
  fetchEarningsBreakdown,
  fetchTreasuryBalances,
  TRANSFER_DIRECTIONS,
  TRANSFER_STATUSES,
} from "./api";
import { MovementsPanel } from "./movements-panel";
import { ReservesPanel } from "./reserves-panel";

const TABS = ["accounts", "reserves", "movements", "earnings"] as const;

const BREAKDOWN_ROWS: { key: keyof EarningsBreakdown; label: string }[] = [
  { key: "cryptoBuyCommissions", label: "Crypto buy commissions" },
  { key: "cryptoSaleCommissions", label: "Crypto sale commissions" },
  { key: "swapFees", label: "Swap fees" },
  { key: "transferFees", label: "Transfer fees" },
  { key: "otherEarnings", label: "Other" },
];

/**
 * Sum the naira estimates across crypto reserves.
 *
 * In floating point, and labelled as an estimate wherever it is shown. Each
 * figure is already an estimate — a crypto amount priced at the company's
 * current rate — so exact decimal arithmetic over them would add precision the
 * inputs do not have. What matters is the order of magnitude: whether the
 * reserves are worth roughly as much as the naira float or a fraction of it.
 */
function totalReserveNaira(reserves: CryptoReserve[] | undefined): number | null {
  if (!reserves || reserves.length === 0) return null;
  const priced = reserves.filter((r) => r.coinBalance.nairaBalance !== null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, r) => sum + Number(r.coinBalance.nairaBalance ?? 0), 0);
}

/** Every balance the company holds, what it owes customers, and how money moved. */
export function TreasuryView() {
  const canViewUsers = useHasPermission("users.view");
  const [state, setState] = useQueryStates(
    {
      tab: parseAsStringLiteral(TABS).withDefault("accounts"),
      range: parseAsStringLiteral([...DATE_PRESETS, "custom"] as const).withDefault("30d"),
      from: parseAsString,
      to: parseAsString,
      type: parseAsStringLiteral(EARNING_TYPES),
      direction: parseAsStringLiteral(TRANSFER_DIRECTIONS),
      status: parseAsStringLiteral(TRANSFER_STATUSES),
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(25),
    },
    { clearOnDefault: true },
  );
  const range = resolveDateRange({ range: state.range, from: state.from, to: state.to });
  const rangeKey = state.range === "custom" ? `${state.from}..${state.to}` : state.range;
  const period = { startDate: range?.from.toISOString(), endDate: range?.to.toISOString() };

  const balances = useQuery({
    queryKey: ["treasury", "balances"],
    queryFn: ({ signal }) => fetchTreasuryBalances(signal),
  });
  // Shared with the reserves tab through the query cache, so the headline
  // figure and the table can never disagree about what is held.
  const reserves = useQuery({
    queryKey: ["treasury", "reserves"],
    queryFn: ({ signal }) => fetchCryptoReserves(signal),
  });
  const breakdown = useQuery({
    queryKey: ["treasury", "breakdown", rangeKey],
    queryFn: ({ signal }) => fetchEarningsBreakdown(period, signal),
    enabled: state.tab === "earnings",
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
    enabled: state.tab === "earnings",
  });

  const b = balances.data;
  const settlement = b?.activeProvider?.cachedBalance ?? b?.nombaSettlement?.balance ?? null;
  const reserveTotal = totalReserveNaira(reserves.data);

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
      {b?.isUnderFunded && (
        <Alert tone="danger">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Settlement balance is below customer balances</AlertTitle>
          <AlertDescription>
            Customers hold more naira than the active payout account. Fund it before the shortfall
            reaches a withdrawal — the account details are under Accounts → Top up.
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Balances" className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">What the company holds</h2>
          <Freshness
            updatedAt={balances.dataUpdatedAt}
            isFetching={balances.isFetching || reserves.isFetching}
            onRefresh={() => {
              void balances.refetch();
              void reserves.refetch();
            }}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Naira float"
            value={settlement !== null ? 0 : undefined}
            display={<Amount value={settlement} currency="NGN" className="font-semibold" />}
            icon={LandmarkIcon}
            isPending={balances.isPending}
            isError={balances.isError}
            definition={
              b?.activeProvider
                ? `Balance on ${b.activeProvider.name}, the account customer payouts leave from.`
                : "Balance on the settlement account customer payouts leave from."
            }
          />
          <Metric
            label="Crypto reserves"
            value={reserveTotal !== null ? 0 : undefined}
            display={<Amount value={reserveTotal} currency="NGN" className="font-semibold" />}
            icon={CoinsIcon}
            isPending={reserves.isPending}
            isError={reserves.isError}
            definition="Every company crypto wallet, priced at the current rate. An estimate — the naira figure moves with the market."
          />
          <Metric
            label="Owed to customers"
            value={b ? 0 : undefined}
            display={
              <Amount value={b?.totalUserLiability} currency="NGN" className="font-semibold" />
            }
            icon={WalletIcon}
            isPending={balances.isPending}
            isError={balances.isError}
            definition="Sum of every customer's naira wallet balance: what the company owes if everyone withdrew today."
          />
          <Metric
            label="Coverage"
            value={b?.isUnderFunded ? 1 : 0}
            attention
            display={<Amount value={b?.coverage} currency="NGN" signed className="font-semibold" />}
            icon={ScaleIcon}
            isPending={balances.isPending}
            isError={balances.isError}
            definition="Naira float minus what customers hold. Negative means a run on withdrawals could not be met from the float alone. Crypto reserves are not counted — they are not naira until sold."
          />
        </div>
      </section>

      <Tabs
        value={state.tab}
        onValueChange={(tab) =>
          void setState({
            tab: tab as (typeof TABS)[number],
            page: 1,
            // Each tab owns its own filters; carrying one tab's into another
            // silently narrows a list the admin has not filtered.
            direction: null,
            status: null,
            type: null,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="accounts">
            <LandmarkIcon aria-hidden />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="reserves">
            <CoinsIcon aria-hidden />
            Crypto reserves
          </TabsTrigger>
          <TabsTrigger value="movements">
            <ArrowLeftRightIcon aria-hidden />
            Movements
          </TabsTrigger>
          <TabsTrigger value="earnings">
            <ScaleIcon aria-hidden />
            Earnings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <AccountsPanel
            providers={balances.data?.providers ?? []}
            isLoading={balances.isFetching}
            error={balances.error}
            onRetry={() => void balances.refetch()}
          />
        </TabsContent>

        <TabsContent value="reserves">
          <ReservesPanel />
        </TabsContent>

        <TabsContent value="movements">
          <div className="grid gap-3 pt-2">
            <DateRangeFilter
              value={{ range: state.range, from: state.from, to: state.to }}
              onChange={(value) =>
                void setState({ ...value, range: value.range ?? "30d", page: 1 })
              }
            />
            <MovementsPanel state={state} setState={setState} period={period} rangeKey={rangeKey} />
          </div>
        </TabsContent>

        <TabsContent value="earnings">
          <div className="grid gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter
                value={{ range: state.range, from: state.from, to: state.to }}
                onChange={(value) =>
                  void setState({ ...value, range: value.range ?? "30d", page: 1 })
                }
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
                      Totals are summed by the API in floating point and may differ from an exact
                      sum by a fraction of a kobo.
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
