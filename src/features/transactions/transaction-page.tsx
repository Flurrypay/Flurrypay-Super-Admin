"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchXIcon } from "lucide-react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPermission } from "@/features/auth/admin-context";

import { fetchTransactionByReference } from "./api";
import { transactionTypeLabel } from "./labels";
import { TransactionDetails } from "./transaction-details";

export function TransactionPage({ reference }: { reference: string }) {
  const canViewUsers = useHasPermission("users.view");
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
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        }
      />
      <TransactionDetails tx={tx} canViewUsers={canViewUsers} />
    </div>
  );
}
