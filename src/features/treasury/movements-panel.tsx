"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, FilterXIcon } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { SelectFilter } from "@/components/filters/select-filter";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/features/auth/admin-context";
import { humanizeEnum } from "@/lib/format";

import {
  fetchTreasuryMovements,
  type TRANSFER_DIRECTIONS,
  TRANSFER_STATUSES,
  type TreasuryMovement,
} from "./api";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  Completed: "success",
  Pending: "warning",
  Failed: "danger",
};

interface Props {
  state: {
    page: number;
    size: number;
    direction: (typeof TRANSFER_DIRECTIONS)[number] | null;
    status: (typeof TRANSFER_STATUSES)[number] | null;
  };
  setState: (patch: Record<string, unknown>) => unknown;
  period: { startDate?: string; endDate?: string };
  rangeKey: string;
}

/**
 * Money in and out of the company's own accounts.
 *
 * Distinct from the customer ledger on the Transactions page: these are the
 * treasury's movements — profit collections, swap fees, payouts, withdrawals —
 * and they are what explain a settlement balance changing without any single
 * customer transaction accounting for it.
 */
export function MovementsPanel({ state, setState, period, rangeKey }: Props) {
  const canViewUsers = useHasPermission("users.view");
  const query = {
    page: state.page,
    pageSize: state.size,
    direction: state.direction,
    status: state.status,
    startDate: period.startDate ?? null,
    endDate: period.endDate ?? null,
  };
  const result = useQuery({
    queryKey: [
      "treasury",
      "movements",
      {
        rangeKey,
        direction: state.direction,
        status: state.status,
        page: state.page,
        size: state.size,
      },
    ],
    queryFn: ({ signal }) => fetchTreasuryMovements(query, signal),
    placeholderData: keepPreviousData,
  });

  const filtering = Boolean(state.direction || state.status);

  const columns: DataColumn<TreasuryMovement>[] = [
    {
      id: "createdAt",
      header: "When",
      required: true,
      cell: (m) => <DateTime value={m.createdAt} />,
      exportValue: (m) => m.createdAt,
    },
    {
      id: "direction",
      header: "Direction",
      cell: (m) => {
        const inward = m.transferDirection === "Inwards";
        const Icon = inward ? ArrowDownLeftIcon : ArrowUpRightIcon;
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Icon
              className={inward ? "size-3.5 text-success" : "size-3.5 text-muted-foreground"}
              aria-hidden
            />
            {inward ? "In" : "Out"}
          </span>
        );
      },
      exportValue: (m) => m.transferDirection,
    },
    {
      id: "type",
      header: "Reason",
      cell: (m) => (
        <span className="grid leading-tight">
          <span>{humanizeEnum(m.transferType)}</span>
          {m.narration && (
            <span className="max-w-72 truncate text-xs text-muted-foreground">{m.narration}</span>
          )}
        </span>
      ),
      exportValue: (m) => m.transferType,
    },
    {
      id: "counterparty",
      header: "Counterparty",
      priority: "secondary",
      sensitive: true,
      cell: (m) =>
        m.counterpartyAccountName || m.counterpartyAccountNumber ? (
          <span className="grid leading-tight">
            <span className="truncate">{m.counterpartyAccountName ?? "—"}</span>
            <span className="text-xs text-muted-foreground">
              {[m.counterpartyBankName, m.counterpartyAccountNumber].filter(Boolean).join(" · ")}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      exportValue: (m) => m.counterpartyAccountName,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (m) => <Amount value={m.amount} currency="NGN" />,
      exportValue: (m) => m.amount,
    },
    {
      id: "fees",
      header: "Fees",
      align: "right",
      priority: "tertiary",
      description: "Provider fee and VAT charged on top of the amount.",
      cell: (m) => (
        <Amount
          value={String(Number(m.fees ?? 0) + Number(m.vat ?? 0))}
          currency="NGN"
          className="font-normal text-muted-foreground"
        />
      ),
      exportValue: (m) => m.fees,
      exportKeys: ["fees", "vat"],
    },
    {
      id: "status",
      header: "Status",
      cell: (m) => <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{m.status || "Unknown"}</Badge>,
      exportValue: (m) => m.status,
    },
    {
      id: "reference",
      header: "Reference",
      priority: "tertiary",
      cell: (m) => <Identifier value={m.paymentReference} truncate label="reference" />,
      exportValue: (m) => m.paymentReference,
    },
    {
      id: "user",
      header: "Customer",
      priority: "tertiary",
      defaultHidden: true,
      cell: (m) =>
        m.relatedUserId && canViewUsers ? (
          <Link href={`/users/${m.relatedUserId}`} className="font-mono text-xs hover:underline">
            {m.relatedUserId.slice(0, 8)}
          </Link>
        ) : (
          <span className="font-mono text-xs">{m.relatedUserId?.slice(0, 8) ?? "—"}</span>
        ),
      exportValue: (m) => m.relatedUserId,
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Direction"
          value={state.direction}
          options={[
            { value: "Inwards", label: "Money in" },
            { value: "Outwards", label: "Money out" },
          ]}
          onChange={(direction) => void setState({ direction, page: 1 })}
        />
        <SelectFilter
          label="Status"
          value={state.status}
          options={TRANSFER_STATUSES.map((value) => ({ value, label: value }))}
          onChange={(status) => void setState({ status, page: 1 })}
        />
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void setState({ direction: null, status: null, page: 1 })}
          >
            <FilterXIcon aria-hidden />
            Clear filters
          </Button>
        )}
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>

      <DataTable
        label="Treasury movements"
        subject="treasury movements"
        columns={columns}
        rows={result.data?.rows ?? []}
        getRowId={(m) => m.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        empty={{
          icon: ArrowLeftRightIcon,
          title: filtering ? "No movements match" : "No movements in this period",
          description: filtering
            ? "Clear a filter or widen the date range."
            : "Profit collections, fees, payouts and withdrawals on the company's own accounts appear here.",
        }}
      />

      <Pagination
        page={state.page}
        pageSize={state.size}
        total={result.data?.total ?? 0}
        onPageChange={(page) => void setState({ page })}
        onPageSizeChange={(size) => void setState({ size, page: 1 })}
      />

      <p className="text-xs text-muted-foreground">
        Scoped to the signed-in administrator&apos;s own account, which is how the API records them.
      </p>
    </div>
  );
}
