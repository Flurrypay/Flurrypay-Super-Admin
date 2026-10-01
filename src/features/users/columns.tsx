"use client";

import Link from "next/link";

import type { DataColumn } from "@/components/data-table/types";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/lib/format";

import { ACCOUNT_STATE, accountStates } from "./account-state";
import type { UserListItem } from "./api";

/** Page-only statistics: not sortable server-side and not in server exports. */
const PAGE_STAT = { exportKeys: [] as string[] };
import { userDisplayName } from "./queries";

export const userColumns: DataColumn<UserListItem>[] = [
  {
    id: "name",
    header: "Customer",
    required: true,
    sortKey: "name",
    sortValue: (u) => userDisplayName(u).toLowerCase(),
    cell: (u) => (
      <span className="grid leading-tight">
        <Link href={`/users/${u.id}`} className="truncate font-medium hover:underline">
          {userDisplayName(u)}
        </Link>
        {u.userName && (
          <span className="truncate text-xs text-muted-foreground">@{u.userName}</span>
        )}
      </span>
    ),
    exportValue: (u) => `${u.firstName} ${u.lastName}`.trim(),
  },
  {
    id: "email",
    header: "Email",
    sensitive: true,
    priority: "secondary",
    cell: (u) => <span className="truncate">{u.email}</span>,
    exportValue: (u) => u.email,
  },
  {
    id: "phone",
    header: "Phone",
    sensitive: true,
    priority: "secondary",
    cell: (u) => (u.phoneNumber ? <span className="font-mono text-xs">{u.phoneNumber}</span> : "—"),
    exportValue: (u) => u.phoneNumber,
  },
  {
    id: "status",
    header: "Status",
    description: "Most severe restriction; hover a badge for its meaning.",
    cell: (u) => {
      const states = accountStates(u);
      return (
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={resolveStatus(ACCOUNT_STATE, states[0])} />
          {states.length > 1 && <Badge tone="neutral">+{states.length - 1}</Badge>}
        </span>
      );
    },
    exportValue: (u) => accountStates(u).join("; "),
  },
  {
    id: "level",
    header: "KYC level",
    sortKey: "level",
    sortValue: (u) => u.level,
    align: "right",
    cell: (u) => <span className="tabular-nums">{u.level}</span>,
    exportValue: (u) => u.level,
  },
  {
    id: "walletBalance",
    header: "Naira balance",
    sortKey: "walletBalance",
    sortValue: (u) => (u.walletBalance === null ? null : Number(u.walletBalance)),
    align: "right",
    description:
      "Naira wallet balance as recorded on the account. Crypto holdings are on the customer page.",
    cell: (u) => <Amount value={u.walletBalance} currency="NGN" />,
    exportValue: (u) => u.walletBalance,
  },
  {
    id: "transactionCount",
    header: "Completed txns",
    align: "right",
    description: "Completed transactions, counted for the customers on this page.",
    ...PAGE_STAT,
    priority: "secondary",
    cell: (u) => <span className="tabular-nums">{formatCount(u.transactionCount)}</span>,
    exportValue: (u) => u.transactionCount,
  },
  {
    id: "lastTransactionDate",
    header: "Last completed txn",
    priority: "secondary",
    ...PAGE_STAT,
    cell: (u) => <DateTime value={u.lastTransactionDate} format="date" />,
    exportValue: (u) => u.lastTransactionDate,
  },
  {
    id: "createdAt",
    header: "Joined",
    sortKey: "createdAt",
    sortValue: (u) => u.createdAt,
    cell: (u) => <DateTime value={u.createdAt} format="date" />,
    exportValue: (u) => u.createdAt,
  },
  {
    id: "lastLogin",
    header: "Last sign-in",
    sortKey: "lastLogin",
    sortValue: (u) => u.lastLogin,
    priority: "tertiary",
    cell: (u) => <DateTime value={u.lastLogin} format="date" />,
    exportValue: (u) => u.lastLogin,
  },
  {
    id: "referralBalance",
    header: "Referral balance",
    defaultHidden: true,
    align: "right",
    cell: (u) => <Amount value={u.referralBalance} currency="NGN" />,
    exportValue: (u) => u.referralBalance,
  },
  {
    id: "id",
    header: "User ID",
    defaultHidden: true,
    cell: (u) => <Identifier value={u.id} truncate label="user ID" />,
    exportValue: (u) => u.id,
  },
];
