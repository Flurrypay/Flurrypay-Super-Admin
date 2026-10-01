"use client";

import { ArrowDownLeftIcon, ArrowUpRightIcon, RepeatIcon } from "lucide-react";
import Link from "next/link";

import type { DataColumn } from "@/components/data-table/types";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";

import type { Transaction } from "./api";
import {
  type Direction,
  TRANSACTION_STATUS,
  transactionDirection,
  transactionTypeLabel,
} from "./labels";

const DIRECTION_ICON: Record<
  Direction,
  { icon: typeof ArrowDownLeftIcon; label: string; className: string }
> = {
  in: { icon: ArrowDownLeftIcon, label: "Inbound", className: "text-success" },
  out: { icon: ArrowUpRightIcon, label: "Outbound", className: "text-muted-foreground" },
  exchange: { icon: RepeatIcon, label: "Exchange", className: "text-info" },
};

export function TransactionType({ type }: { type: string }) {
  const direction = transactionDirection(type);
  const meta = direction ? DIRECTION_ICON[direction] : null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {meta && <meta.icon className={`size-3.5 ${meta.className}`} aria-label={meta.label} />}
      {transactionTypeLabel(type)}
    </span>
  );
}

function customerName(tx: Transaction): string {
  if (!tx.user) return "";
  return `${tx.user.firstName} ${tx.user.lastName}`.trim() || tx.user.email;
}

export function transactionColumns({
  canViewUsers,
}: {
  canViewUsers: boolean;
}): DataColumn<Transaction>[] {
  return [
    {
      id: "createdAt",
      header: "Created",
      required: true,
      sortKey: "createdAt",
      cell: (tx) => <DateTime value={tx.createdAt} />,
      exportValue: (tx) => tx.createdAt,
    },
    {
      id: "reference",
      header: "Reference",
      priority: "tertiary",
      cell: (tx) => <Identifier value={tx.reference} truncate label="reference" />,
      exportValue: (tx) => tx.reference,
    },
    {
      id: "type",
      header: "Type",
      sortKey: "transactionType",
      cell: (tx) => <TransactionType type={tx.transactionType} />,
      exportValue: (tx) => tx.transactionType,
    },
    {
      id: "customer",
      header: "Customer",
      sensitive: true,
      priority: "secondary",
      cell: (tx) =>
        tx.user ? (
          <span className="grid leading-tight">
            {canViewUsers ? (
              <Link href={`/users/${tx.user.id}`} className="truncate font-medium hover:underline">
                {customerName(tx)}
              </Link>
            ) : (
              <span className="truncate font-medium">{customerName(tx)}</span>
            )}
            <span className="truncate text-xs text-muted-foreground">{tx.user.email}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Unknown</span>
        ),
      exportValue: (tx) => tx.user?.email,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortKey: "amount",
      description: "Exact ledger amount in the transaction's own currency.",
      cell: (tx) => <Amount value={tx.amount} currency={tx.currency} />,
      exportValue: (tx) => tx.amount,
    },
    {
      id: "currency",
      header: "Currency",
      defaultHidden: true,
      cell: (tx) => tx.currency ?? "—",
      exportValue: (tx) => tx.currency,
    },
    {
      id: "fee",
      header: "Fee",
      align: "right",
      priority: "tertiary",
      cell: (tx) => (
        <Amount
          value={tx.fee}
          currency={tx.feeCurrency ?? tx.currency}
          className="font-normal text-muted-foreground"
        />
      ),
      exportValue: (tx) => tx.fee,
      exportKeys: ["fee", "feeCurrency"],
    },
    {
      id: "status",
      header: "Status",
      sortKey: "status",
      cell: (tx) => <StatusBadge status={resolveStatus(TRANSACTION_STATUS, tx.status)} />,
      exportValue: (tx) => tx.status,
    },
    {
      id: "provider",
      header: "Provider",
      priority: "secondary",
      defaultHidden: true,
      cell: (tx) => tx.provider ?? "—",
      exportValue: (tx) => tx.provider,
    },
    {
      id: "network",
      header: "Network",
      defaultHidden: true,
      cell: (tx) => tx.network ?? "—",
      exportValue: (tx) => tx.network,
    },
    {
      id: "failureReason",
      header: "Failure reason",
      defaultHidden: true,
      className: "max-w-64 truncate",
      cell: (tx) => tx.failureReason ?? "—",
      exportValue: (tx) => tx.failureReason,
    },
    {
      id: "externalId",
      header: "Provider reference",
      defaultHidden: true,
      cell: (tx) => <Identifier value={tx.externalId} truncate label="provider reference" />,
      exportValue: (tx) => tx.externalId,
    },
    {
      id: "id",
      header: "Internal ID",
      defaultHidden: true,
      cell: (tx) => <Identifier value={tx.id} truncate label="internal ID" />,
      exportValue: (tx) => tx.id,
    },
    {
      id: "updatedAt",
      header: "Updated",
      defaultHidden: true,
      cell: (tx) => <DateTime value={tx.updatedAt} />,
      exportValue: (tx) => tx.updatedAt,
    },
  ];
}
