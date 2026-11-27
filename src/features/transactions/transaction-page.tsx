"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, FlagIcon, FlagOffIcon, RefreshCwIcon, SearchXIcon } from "lucide-react";
import { useState } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPermission } from "@/features/auth/admin-context";

import { fetchTransactionByReference, isFlagged } from "./api";
import { ClearFlagDialog, FlagTransactionDialog, ResolveDepositDialog } from "./flag-dialogs";
import { transactionTypeLabel } from "./labels";
import { ResolvePendingDialog } from "./resolve-pending-dialog";
import { TransactionDetails } from "./transaction-details";

export function TransactionPage({ reference }: { reference: string }) {
  const canViewUsers = useHasPermission("users.view");
  const canManageUsers = useHasPermission("users.manage");
  const canFlag = useHasPermission("compliance.review");
  const [flagDialog, setFlagDialog] = useState<"raise" | "clear" | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolvePendingOpen, setResolvePendingOpen] = useState(false);
  const result = useQuery({
    queryKey: ["transaction", reference],
    queryFn: ({ signal }) => fetchTransactionByReference(reference, signal),
  });

  const crumbs = (
    <Breadcrumbs items={[{ label: "Transactions", href: "/transactions" }, { label: reference }]} />
  );

  if (result.isPending) {
    return (
      <div className="grid max-w-3xl gap-4">
        {crumbs}
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (result.isError) {
    return (
      <>
        {crumbs}
        <ErrorState
          error={result.error}
          subject="this transaction"
          onRetry={() => void result.refetch()}
        />
      </>
    );
  }

  const tx = result.data;
  if (!tx) {
    return (
      <>
        {crumbs}
        <EmptyState
          icon={SearchXIcon}
          title="Transaction not found"
          description={`No transaction has the reference ${reference}. Check the reference, or search the ledger.`}
        />
      </>
    );
  }

  return (
    <div className="grid max-w-3xl gap-2">
      <PageHeader
        eyebrow={crumbs}
        title={transactionTypeLabel(tx.transactionType)}
        description={tx.reference ?? tx.id}
        actions={
          <>
            <Freshness
              updatedAt={result.dataUpdatedAt}
              isFetching={result.isFetching}
              onRefresh={() => void result.refetch()}
            />
            {canManageUsers &&
              (tx.status === "ON_HOLD" || tx.metadata?.holdReason === "NAME_MISMATCH") &&
              !tx.metadata?.resolved && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setResolveOpen(true);
                  }}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <CheckCircle2Icon aria-hidden className="mr-1.5 size-4" />
                  Resolve &amp; Credit
                </Button>
              )}
            {(tx.status === "PENDING" || tx.status === "PROCESSING" || tx.status === "FAILED") &&
              !tx.reversedAt && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setResolvePendingOpen(true);
                  }}
                  className="bg-primary text-primary-foreground"
                >
                  <RefreshCwIcon aria-hidden className="mr-1.5 size-4" />
                  Resolve Transfer
                </Button>
              )}
            {canFlag &&
              (isFlagged(tx) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFlagDialog("clear");
                  }}
                >
                  <FlagOffIcon aria-hidden />
                  Clear flag
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFlagDialog("raise");
                  }}
                >
                  <FlagIcon aria-hidden />
                  Flag for review
                </Button>
              ))}
          </>
        }
      />
      <TransactionDetails tx={tx} canViewUsers={canViewUsers} />
      <ResolveDepositDialog tx={tx} open={resolveOpen} onOpenChange={setResolveOpen} />
      <ResolvePendingDialog
        reference={tx.reference ?? tx.id}
        amount={tx.amount}
        customerName={
          tx.user ? `${tx.user.firstName} ${tx.user.lastName}`.trim() || tx.user.email : undefined
        }
        open={resolvePendingOpen}
        onOpenChange={setResolvePendingOpen}
        onSuccess={() => void result.refetch()}
      />
      {canFlag && (
        <>
          <FlagTransactionDialog
            tx={tx}
            open={flagDialog === "raise"}
            onOpenChange={(next) => {
              if (!next) setFlagDialog(null);
            }}
          />
          <ClearFlagDialog
            tx={tx}
            open={flagDialog === "clear"}
            onOpenChange={(next) => {
              if (!next) setFlagDialog(null);
            }}
          />
        </>
      )}
    </div>
  );
}
