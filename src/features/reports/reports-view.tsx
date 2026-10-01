"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BarChart3Icon } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo } from "react";

import { type ChartSeries, ColumnChart, type ColumnDatum } from "@/components/charts/column-chart";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DetailSection } from "@/components/detail/detail-list";
import { DATE_PRESETS, describeDateRange, resolveDateRange } from "@/components/filters/date-range";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { Amount } from "@/components/format/amount";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPermission } from "@/features/auth/admin-context";
import { TRANSACTION_STATUS, transactionTypeLabel } from "@/features/transactions/labels";
import { addDaysToDateString, toZonedDateString } from "@/lib/date";
import { formatCount } from "@/lib/format";

import {
  fetchTransactionsReport,
  fetchUsersReport,
  REPORT_MAX_DAYS,
  type TransactionsReport,
} from "./api";

type BreakdownRow = TransactionsReport["breakdown"][number];

const TX_SERIES: ChartSeries[] = [
  { name: "Completed", color: "var(--viz-1)" },
  { name: "Failed", color: "var(--viz-2)" },
  { name: "Other statuses", color: "var(--viz-3)" },
];
const SIGNUP_SERIES: ChartSeries[] = [{ name: "Sign-ups", color: "var(--viz-1)" }];

const dayLabel = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Every WAT day in the range, so days without activity show as zero instead of disappearing. */
function daysBetween(from: Date, to: Date): string[] {
  const first = toZonedDateString(from);
  const last = toZonedDateString(to);
  const days: string[] = [];
  for (
    let day = first;
    day <= last && days.length <= REPORT_MAX_DAYS + 1;
    day = addDaysToDateString(day, 1)
  ) {
    days.push(day);
  }
  return days;
}

function label(day: string): string {
  return dayLabel.format(new Date(`${day}T00:00:00Z`));
}

/** Transaction and customer activity over a chosen period. Days are WAT calendar days. */
export function ReportsView() {
  const canTransactions = useHasPermission("transactions.view");
  const canUsers = useHasPermission("users.view");
  const [state, setState] = useQueryStates(
    {
      range: parseAsStringLiteral([...DATE_PRESETS, "custom"] as const).withDefault("30d"),
      from: parseAsString,
      to: parseAsString,
    },
    { clearOnDefault: true },
  );
  const resolved = resolveDateRange({ range: state.range, from: state.from, to: state.to });
  const rangeKey = state.range === "custom" ? `${state.from}..${state.to}` : state.range;
  const tooLong =
    resolved !== null &&
    resolved.to.getTime() - resolved.from.getTime() > REPORT_MAX_DAYS * 86_400_000;
  const period =
    resolved && !tooLong
      ? { from: resolved.from.toISOString(), to: resolved.to.toISOString() }
      : null;

  const transactions = useQuery({
    queryKey: ["reports", "transactions", rangeKey],
    queryFn: ({ signal }) => fetchTransactionsReport(period ?? { from: "", to: "" }, signal),
    enabled: canTransactions && period !== null,
    placeholderData: keepPreviousData,
  });
  const users = useQuery({
    queryKey: ["reports", "users", rangeKey],
    queryFn: ({ signal }) => fetchUsersReport(period ?? { from: "", to: "" }, signal),
    enabled: canUsers && period !== null,
    placeholderData: keepPreviousData,
  });

  const days = useMemo(() => (resolved ? daysBetween(resolved.from, resolved.to) : []), [resolved]);

  const txColumns = useMemo<ColumnDatum[]>(() => {
    const byDay = new Map((transactions.data?.daily ?? []).map((d) => [d.day, d]));
    return days.map((day) => {
      const d = byDay.get(day);
      const completed = d?.completed ?? 0;
      const failed = d?.failed ?? 0;
      return {
        key: day,
        label: label(day),
        values: [completed, failed, Math.max(0, (d?.count ?? 0) - completed - failed)],
      };
    });
  }, [days, transactions.data]);

  const signupColumns = useMemo<ColumnDatum[]>(() => {
    const byDay = new Map((users.data?.signups ?? []).map((d) => [d.day, d.count]));
    return days.map((day) => ({ key: day, label: label(day), values: [byDay.get(day) ?? 0] }));
  }, [days, users.data]);

  const txTotal = txColumns.reduce((sum, d) => sum + d.values.reduce((a, b) => a + b, 0), 0);
  const txFailed = txColumns.reduce((sum, d) => sum + (d.values[1] ?? 0), 0);
  const signupTotal = signupColumns.reduce((sum, d) => sum + (d.values[0] ?? 0), 0);
  const updatedAt = Math.min(
    ...[transactions.dataUpdatedAt, users.dataUpdatedAt].filter((t) => t > 0),
  );

  const breakdownColumns: DataColumn<BreakdownRow>[] = [
    {
      id: "type",
      header: "Type",
      required: true,
      cell: (r) => transactionTypeLabel(r.type),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={resolveStatus(TRANSACTION_STATUS, r.status)} />,
    },
    { id: "currency", header: "Currency", cell: (r) => r.currency || "—" },
    {
      id: "count",
      header: "Count",
      align: "right",
      cell: (r) => <span className="tabular-nums">{formatCount(r.count)}</span>,
    },
    {
      id: "amount",
      header: "Total amount",
      align: "right",
      cell: (r) => <Amount value={r.totalAmount} currency={r.currency || null} />,
    },
    {
      id: "fee",
      header: "Total fees",
      align: "right",
      priority: "secondary",
      cell: (r) => (
        <Amount value={r.totalFee} currency={r.currency || null} className="font-normal" />
      ),
    },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter
          value={{ range: state.range, from: state.from, to: state.to }}
          onChange={(value) => void setState({ ...value, range: value.range ?? "30d" })}
        />
        <span className="text-xs text-muted-foreground">
          {describeDateRange({ range: state.range, from: state.from, to: state.to })} · days in WAT
        </span>
        <div className="ml-auto">
          {Number.isFinite(updatedAt) && (
            <Freshness
              updatedAt={updatedAt}
              isFetching={transactions.isFetching || users.isFetching}
              onRefresh={() => {
                void transactions.refetch();
                void users.refetch();
              }}
            />
          )}
        </div>
      </div>

      {tooLong && (
        <EmptyState
          icon={BarChart3Icon}
          title="Range too long"
          description={`Reports cover at most ${REPORT_MAX_DAYS} days. Choose a shorter range.`}
        />
      )}

      {canTransactions && period && (
        <DetailSection title="Transactions per day">
          {transactions.isPending ? (
            <Skeleton className="h-56" />
          ) : transactions.isError ? (
            <ErrorState
              error={transactions.error}
              subject="the transactions report"
              onRetry={() => void transactions.refetch()}
            />
          ) : (
            <div className="grid gap-4">
              <p className="text-sm">
                <span className="text-2xl font-semibold tabular-nums">{formatCount(txTotal)}</span>{" "}
                <span className="text-muted-foreground">
                  transactions, {formatCount(txFailed)} failed
                  {txTotal > 0 && ` (${((txFailed / txTotal) * 100).toFixed(1)}%)`}
                </span>
              </p>
              <ColumnChart
                label="Transactions per day by outcome"
                series={TX_SERIES}
                data={txColumns}
                isFetching={transactions.isFetching}
              />
              <DataTable
                label="Totals by type, status and currency"
                subject="the breakdown"
                columns={breakdownColumns}
                rows={transactions.data.breakdown}
                getRowId={(r) => `${r.type}|${r.status}|${r.currency}`}
                isLoading={false}
                error={null}
                empty={{
                  icon: BarChart3Icon,
                  title: "No transactions in this period",
                  description: "Choose a longer range to see activity.",
                }}
              />
              <p className="text-xs text-muted-foreground">
                Amounts are exact sums per currency, computed by the database. They are not
                converted between currencies.
              </p>
            </div>
          )}
        </DetailSection>
      )}

      {canUsers && period && (
        <DetailSection title="Customers">
          {users.isPending ? (
            <Skeleton className="h-56" />
          ) : users.isError ? (
            <ErrorState
              error={users.error}
              subject="the customers report"
              onRetry={() => void users.refetch()}
            />
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-2">
                <p className="text-sm">
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatCount(signupTotal)}
                  </span>{" "}
                  <span className="text-muted-foreground">sign-ups in this period</span>
                </p>
                <ColumnChart
                  label="Sign-ups per day"
                  series={SIGNUP_SERIES}
                  data={signupColumns}
                  isFetching={users.isFetching}
                />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium">KYC level, all customers</h3>
                  <LevelBars levels={users.data.levels} total={users.data.totals.total} />
                </div>
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium">Account state, all customers</h3>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    {(
                      [
                        ["Total", users.data.totals.total],
                        ["Email confirmed", users.data.totals.confirmed],
                        ["Blocked", users.data.totals.blocked],
                        ["Suspended", users.data.totals.suspended],
                        ["Frozen", users.data.totals.frozen],
                        ["Locked now", users.data.totals.locked],
                      ] as const
                    ).map(([name, value]) => (
                      <div key={name} className="rounded-md border px-3 py-2">
                        <dt className="text-xs text-muted-foreground">{name}</dt>
                        <dd className="font-semibold tabular-nums">{formatCount(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          )}
        </DetailSection>
      )}
    </div>
  );
}

/** Horizontal bars with the value at each tip; the numbers themselves carry the data. */
function LevelBars({
  levels,
  total,
}: {
  levels: { level: number; count: number }[];
  total: number;
}) {
  const max = Math.max(1, ...levels.map((l) => l.count));
  if (levels.length === 0)
    return <p className="text-sm text-muted-foreground">No customers yet.</p>;
  return (
    <ul className="grid gap-2" aria-label="Customers by KYC level">
      {levels.map((l) => (
        <li key={l.level} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-sm">
          <span className="text-muted-foreground">Level {l.level}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r-[4px]"
              style={{ width: `${(l.count / max) * 65}%`, minWidth: 2, background: "var(--viz-1)" }}
              aria-hidden
            />
            <span className="whitespace-nowrap tabular-nums">
              {formatCount(l.count)}
              {total > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {((l.count / total) * 100).toFixed(1)}%
                </span>
              )}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
