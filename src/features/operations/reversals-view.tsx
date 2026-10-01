"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { SelectFilter } from "@/components/filters/select-filter";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { transactionTypeLabel } from "@/features/transactions/labels";
import { formatAmount } from "@/lib/format";

import { fetchReversalCandidates, type ReversalCandidate, reverseTransaction } from "./api";

const WINDOWS = ["30", "90", "180", "365"] as const;

/**
 * Failed transactions that may have debited the customer without returning the
 * money. The API lists candidates for review instead of refunding them
 * automatically; each reversal is confirmed by a super admin.
 */
export function ReversalsView() {
  const queryClient = useQueryClient();
  const [sinceDays, setSinceDays] = useQueryState("since", parseAsInteger.withDefault(90));
  const [pending, setPending] = useState<ReversalCandidate | null>(null);

  const result = useQuery({
    queryKey: ["reversal-candidates", sinceDays],
    queryFn: ({ signal }) => fetchReversalCandidates(sinceDays, signal),
  });

  const reverse = useMutation({
    mutationFn: reverseTransaction,
    onSuccess: async (data) => {
      toast.success(data.message || "Transaction reversed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reversal-candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
  });

  const columns: DataColumn<ReversalCandidate>[] = [
    {
      id: "reference",
      header: "Reference",
      required: true,
      cell: (r) => (
        <span className="grid leading-tight">
          <Link
            href={`/transactions/${encodeURIComponent(r.reference)}`}
            className="font-mono text-xs hover:underline"
          >
            {r.reference}
          </Link>
          <span className="text-xs text-muted-foreground">{transactionTypeLabel(r.type)}</span>
        </span>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (r) => (
        <Link href={`/users/${r.userid}`} className="grid leading-tight hover:underline">
          <span className="truncate font-medium">{r.firstname ?? "Customer"}</span>
          {r.email && <span className="truncate text-xs text-muted-foreground">{r.email}</span>}
        </Link>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (r) => <Amount value={r.amount} currency={r.currency} />,
    },
    {
      id: "status",
      header: "Refund record",
      description:
        "Older failures predate refund tracking, so the API cannot tell whether they were already returned.",
      cell: (r) =>
        r.reversalStatusUnknown ? (
          <Badge tone="warning">
            <TriangleAlertIcon aria-hidden />
            Unknown
          </Badge>
        ) : (
          <Badge tone="neutral">Not refunded</Badge>
        ),
    },
    {
      id: "note",
      header: "Note",
      priority: "tertiary",
      className: "max-w-64 truncate text-xs text-muted-foreground",
      cell: (r) => r.note ?? "—",
    },
    {
      id: "createdAt",
      header: "Failed",
      priority: "secondary",
      cell: (r) => <DateTime value={r.createdat} />,
    },
    {
      id: "actions",
      header: "Reverse",
      required: true,
      align: "right",
      cell: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setPending(r);
          }}
        >
          <Undo2Icon aria-hidden />
          Reverse
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Failed within"
          value={String(sinceDays) as (typeof WINDOWS)[number]}
          options={WINDOWS.map((value) => ({ value, label: `Last ${value} days` }))}
          onChange={(value) => void setSinceDays(value ? Number(value) : null)}
        />
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>

      <DataTable
        label="Reversal candidates"
        subject="reversal candidates"
        columns={columns}
        rows={result.data ?? []}
        getRowId={(r) => r.reference}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        empty={{
          icon: CircleCheckIcon,
          title: "No reversal candidates",
          description: "No failed transactions in this window are waiting to be returned.",
        }}
      />

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Reverse transaction"
        target={
          pending && (
            <span className="grid">
              <span className="font-mono text-xs">{pending.reference}</span>
              <span className="text-xs text-muted-foreground">
                {pending.email ?? pending.firstname} ·{" "}
                {formatAmount(pending.amount, pending.currency)}
              </span>
            </span>
          )
        }
        impact="Returns the amount to the customer's wallet and notifies them with your reason. The API refuses if it finds the money was already returned."
        confirmLabel="Reverse and refund"
        tone="danger"
        reason={{
          required: true,
          minLength: 5,
          label: "Reason shown to the customer",
          hint: "The customer sees this. It is also recorded in the audit log.",
        }}
        stepUp={{ password: true, twoFactor: true }}
        acknowledgement={
          pending?.reversalStatusUnknown
            ? "I checked this customer's wallet history and confirm this amount was never returned to them."
            : undefined
        }
        onConfirm={({ reason, password, twoFACode }) =>
          pending
            ? reverse.mutateAsync({
                reference: pending.reference,
                reason,
                confirmedNotAlreadyRefunded: pending.reversalStatusUnknown,
                password: password ?? "",
                twoFACode: twoFACode ?? "",
              })
            : Promise.resolve()
        }
      />
    </div>
  );
}
