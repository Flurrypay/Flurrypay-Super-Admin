"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  ClockIcon,
  HourglassIcon,
  PackageCheckIcon,
  Undo2Icon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAdmin } from "@/features/auth/admin-context";
import { hasPermission } from "@/features/auth/permissions";
import { Metric } from "@/features/overview/metric";
import { transactionTypeLabel } from "@/features/transactions/labels";
import { formatAmount, humanizeEnum } from "@/lib/format";

import {
  fetchStrandedTransfers,
  markStrandedDelivered,
  refundStranded,
  type StrandedTransfer,
} from "./api";
import { formatAge } from "./format";

type Resolution = "delivered" | "refund";

const RESOLUTION: Record<
  Resolution,
  { title: string; impact: string; confirm: string; hint: string; done: string }
> = {
  delivered: {
    title: "Mark as delivered",
    impact:
      "Records that the provider did pay the recipient. The transfer is marked completed and no money moves. Use this only after confirming delivery with the provider or the recipient's bank.",
    confirm: "Mark delivered",
    hint: "At least 10 characters. Say where you confirmed delivery (e.g. provider dashboard, session ID).",
    done: "Marked as delivered",
  },
  refund: {
    title: "Refund to customer",
    impact:
      "Returns the principal to the customer's naira wallet. Any fee already returned is not refunded again. Use this only after confirming the provider never sent the money.",
    confirm: "Refund principal",
    hint: "At least 10 characters. Say how you confirmed the money was never sent.",
    done: "Refunded to customer",
  },
};

/** Transfers debited from customers but neither delivered nor returned. */
export function StrandedView() {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const canResolve = hasPermission(admin, "wallets.withdraw");
  const canViewUsers = hasPermission(admin, "users.view");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [pending, setPending] = useState<{ row: StrandedTransfer; action: Resolution } | null>(
    null,
  );

  const result = useQuery({
    queryKey: ["stranded", { includeResolved }],
    queryFn: ({ signal }) => fetchStrandedTransfers(includeResolved, signal),
  });

  const resolve = useMutation({
    mutationFn: ({
      reference,
      action,
      note,
      twoFACode,
    }: {
      reference: string;
      action: Resolution;
      note: string;
      twoFACode: string;
    }) =>
      action === "refund"
        ? refundStranded(reference, { note, twoFACode })
        : markStrandedDelivered(reference, { note, twoFACode }),
    onSuccess: async (data, { action }) => {
      toast.success(data.message || RESOLUTION[action].done);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stranded"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
  });

  const summary = result.data?.summary;
  const columns: DataColumn<StrandedTransfer>[] = [
    {
      id: "reference",
      header: "Reference",
      required: true,
      cell: (r) => (
        <span className="grid leading-tight">
          <Link
            href={`/transactions/${encodeURIComponent(r.reference)}`}
            className="font-mono text-xs whitespace-nowrap hover:underline"
          >
            {r.reference}
          </Link>
          <span className="text-xs text-muted-foreground">
            {transactionTypeLabel(r.transactionType)}
          </span>
        </span>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (r) => (
        <span className="grid leading-tight">
          {canViewUsers ? (
            <Link href={`/users/${r.userId}`} className="truncate font-medium hover:underline">
              {r.fullName || r.email || "Customer"}
            </Link>
          ) : (
            <span className="truncate font-medium">{r.fullName || r.email || "Customer"}</span>
          )}
          {r.email && <span className="truncate text-xs text-muted-foreground">{r.email}</span>}
        </span>
      ),
    },
    {
      id: "owed",
      header: "Owed",
      align: "right",
      description:
        "The principal. A fee already returned is shown separately and is not owed again.",
      cell: (r) => (
        <span className="grid justify-items-end leading-tight">
          <Amount value={r.owedNaira} currency="NGN" />
          {r.feeAlreadyRefundedNaira && Number(r.feeAlreadyRefundedNaira) > 0 && (
            <span className="text-xs text-muted-foreground">
              fee returned {formatAmount(r.feeAlreadyRefundedNaira, "NGN")}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "age",
      header: "Age",
      align: "right",
      cell: (r) => (
        <span
          className={
            r.ageHours >= 24
              ? "font-medium whitespace-nowrap text-warning tabular-nums"
              : "whitespace-nowrap tabular-nums"
          }
        >
          {formatAge(r.ageHours)}
        </span>
      ),
    },
    {
      id: "stage",
      header: "Stage",
      priority: "secondary",
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone="neutral">{humanizeEnum(r.status)}</Badge>
          {r.stage && <Badge tone="info">{humanizeEnum(r.stage)}</Badge>}
          {r.alreadyRefunded && <Badge tone="success">Refunded</Badge>}
        </span>
      ),
    },
    {
      id: "destination",
      header: "Destination",
      priority: "tertiary",
      description: "Recipient bank and account, and the provider's reference for the payout.",
      cell: (r) =>
        r.bankName || r.accountNumber || r.externalId ? (
          <span className="grid text-xs leading-tight">
            <span>
              {r.bankName ?? "—"}{" "}
              <span className="font-mono text-muted-foreground">{r.accountNumber ?? ""}</span>
            </span>
            {r.externalId && (
              <span className="font-mono text-muted-foreground">{r.externalId}</span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "createdAt",
      header: "Started",
      priority: "tertiary",
      cell: (r) => <DateTime value={r.createdAt} />,
    },
  ];
  if (canResolve) {
    columns.push({
      id: "actions",
      header: "Resolve",
      required: true,
      align: "right",
      cell: (r) =>
        r.alreadyRefunded ? (
          <span className="text-xs text-muted-foreground">Resolved</span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                Resolve
                <ChevronDownIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setPending({ row: r, action: "delivered" });
                }}
              >
                <PackageCheckIcon aria-hidden />
                Mark as delivered
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setPending({ row: r, action: "refund" });
                }}
              >
                <Undo2Icon aria-hidden />
                Refund to customer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    });
  }

  const spec = pending ? RESOLUTION[pending.action] : null;

  return (
    <div className="grid gap-4">
      <section aria-label="Summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="Stranded transfers"
          value={summary?.count}
          icon={HourglassIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition="Transfers debited from the customer that were neither confirmed delivered nor returned."
        />
        <Metric
          label="Customer money outstanding"
          value={summary ? Number(summary.totalNaira ?? 0) : undefined}
          display={<Amount value={summary?.totalNaira} currency="NGN" className="font-semibold" />}
          icon={WalletIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition="Sum of the principal owed across the listed transfers, as totalled by the API."
        />
        <Metric
          label="Oldest"
          value={summary?.oldestHours}
          display={summary ? formatAge(summary.oldestHours) : undefined}
          icon={ClockIcon}
          attention={(summary?.oldestHours ?? 0) >= 24}
          isPending={result.isPending}
          isError={result.isError}
          definition="Age of the oldest listed transfer since it was started."
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={includeResolved} onCheckedChange={setIncludeResolved} />
          Include resolved
        </label>
        {!canResolve && (
          <p className="text-xs text-muted-foreground">
            Resolving needs the company-withdrawal permission, which only super admins hold.
          </p>
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
        label="Stranded transfers"
        subject="stranded transfers"
        columns={columns}
        rows={result.data?.items ?? []}
        getRowId={(r) => r.reference}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        empty={{
          icon: CircleCheckIcon,
          title: "Nothing stranded",
          description:
            "Every outbound transfer has either been delivered or returned to the customer.",
        }}
      />

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={spec?.title ?? ""}
        target={
          pending && (
            <span className="grid">
              <span className="font-mono text-xs">{pending.row.reference}</span>
              <span className="text-xs text-muted-foreground">
                {pending.row.fullName || pending.row.email} ·{" "}
                {formatAmount(pending.row.owedNaira, "NGN")}
              </span>
            </span>
          )
        }
        impact={spec?.impact ?? ""}
        confirmLabel={spec?.confirm ?? ""}
        tone={pending?.action === "refund" ? "danger" : "default"}
        reason={{ required: true, minLength: 10, label: "Note", hint: spec?.hint }}
        stepUp={{ twoFactor: true }}
        onConfirm={({ reason, twoFACode }) =>
          pending
            ? resolve.mutateAsync({
                reference: pending.row.reference,
                action: pending.action,
                note: reason,
                twoFACode: twoFACode ?? "",
              })
            : Promise.resolve()
        }
      />
    </div>
  );
}
