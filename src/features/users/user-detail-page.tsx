"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  ClipboardListIcon,
  LayoutListIcon,
  ScanFaceIcon,
  UserXIcon,
  WalletIcon,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditTable } from "@/features/audit/audit-view";
import { useAdmin } from "@/features/auth/admin-context";
import { hasPermission } from "@/features/auth/permissions";
import { fetchUserKyc } from "@/features/kyc/api";
import { KycSummary } from "@/features/kyc/kyc-summary";
import { UserHoldButton } from "@/features/risk/user-hold-button";
import { TransactionsView } from "@/features/transactions/transactions-view";
import { isNotFound } from "@/lib/api/errors";

import { ACCOUNT_STATE, accountStates } from "./account-state";
import { fetchUser } from "./api";
import { userDisplayName } from "./queries";
import { StatementDialog } from "./statement-dialog";
import { UserActions } from "./user-actions";
import { UserActivity } from "./user-activity";
import { UserOverview } from "./user-overview";
import { UserWallets } from "./user-wallets";

const TABS = ["overview", "kyc", "wallets", "transactions", "activity", "audit"] as const;

export function UserDetailPage({ userId }: { userId: string }) {
  const admin = useAdmin();
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("overview"));
  const user = useQuery({
    queryKey: ["user", userId],
    queryFn: ({ signal }) => fetchUser(userId, signal),
  });

  const canTransactions = hasPermission(admin, "transactions.view");
  const canKyc = hasPermission(admin, "kyc.review");
  const canAudit = hasPermission(admin, "auditLogs.view");

  const crumbs = (
    <Breadcrumbs
      items={[
        { label: "Users", href: "/users" },
        { label: user.data ? userDisplayName(user.data) : "Customer" },
      ]}
    />
  );

  if (user.isPending) {
    return (
      <div className="grid gap-4">
        {crumbs}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-9 w-full max-w-xl" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (user.isError) {
    if (isNotFound(user.error)) {
      return (
        <>
          {crumbs}
          <EmptyState
            icon={UserXIcon}
            title="Customer not found"
            description="This account doesn't exist or has been removed."
          />
        </>
      );
    }
    return (
      <>
        {crumbs}
        <ErrorState
          error={user.error}
          subject="this customer"
          onRetry={() => void user.refetch()}
        />
      </>
    );
  }

  const data = user.data;
  const states = accountStates(data);
  const name = userDisplayName(data);

  return (
    <div className="grid gap-2">
      <PageHeader
        eyebrow={crumbs}
        title={name}
        description={[data.userName && `@${data.userName}`, data.email].filter(Boolean).join(" · ")}
        actions={
          <>
            <Freshness
              updatedAt={user.dataUpdatedAt}
              isFetching={user.isFetching}
              onRefresh={() => void user.refetch()}
            />
            <StatementDialog userId={userId} name={name} />
            <UserHoldButton userId={userId} customer={name} />
            <UserActions user={data} />
          </>
        }
      />
      <div className="-mt-2 mb-2 flex flex-wrap gap-1.5">
        {states.map((state) => (
          <StatusBadge key={state} status={resolveStatus(ACCOUNT_STATE, state)} />
        ))}
      </div>

      <Tabs value={tab} onValueChange={(value) => void setTab(value as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutListIcon aria-hidden />
            Overview
          </TabsTrigger>
          {canKyc && (
            <TabsTrigger value="kyc">
              <ScanFaceIcon aria-hidden />
              KYC
            </TabsTrigger>
          )}
          <TabsTrigger value="wallets">
            <WalletIcon aria-hidden />
            Wallets
          </TabsTrigger>
          {canTransactions && (
            <TabsTrigger value="transactions">
              <ArrowLeftRightIcon aria-hidden />
              Transactions
            </TabsTrigger>
          )}
          <TabsTrigger value="activity">
            <ActivityIcon aria-hidden />
            Activity
          </TabsTrigger>
          {canAudit && (
            <TabsTrigger value="audit">
              <ClipboardListIcon aria-hidden />
              Audit history
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="overview">
          <UserOverview user={data} />
        </TabsContent>
        {canKyc && (
          <TabsContent value="kyc">
            <UserKyc userId={userId} name={name} />
          </TabsContent>
        )}
        <TabsContent value="wallets">
          <UserWallets user={data} />
        </TabsContent>
        {canTransactions && (
          <TabsContent value="transactions">
            <TransactionsView userId={userId} tableId="user-transactions" />
          </TabsContent>
        )}
        <TabsContent value="activity">
          <UserActivity userId={userId} />
        </TabsContent>
        {canAudit && (
          <TabsContent value="audit">
            <UserAudit userId={userId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function UserKyc({ userId, name }: { userId: string; name: string }) {
  const result = useQuery({
    queryKey: ["user-kyc", userId],
    queryFn: ({ signal }) => fetchUserKyc(userId, signal),
  });
  if (result.isPending) return <Skeleton className="h-64" />;
  if (result.isError)
    return (
      <ErrorState
        error={result.error}
        subject="KYC details"
        onRetry={() => void result.refetch()}
      />
    );
  if (!result.data.profile) {
    return (
      <EmptyState
        icon={ScanFaceIcon}
        title="No KYC profile"
        description="The customer hasn't started verification."
      />
    );
  }
  return <KycSummary profile={result.data.profile} customerName={name} />;
}

/** Administrator actions whose recorded details reference this customer. */
function UserAudit({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  return (
    <AuditTable
      tableId="user-audit"
      page={page}
      pageSize={pageSize}
      search={userId}
      action={null}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
      }}
      emptyDescription="No administrator actions reference this customer."
      toolbar={
        <p className="text-xs text-muted-foreground">
          Administrator actions that reference this customer.
        </p>
      }
    />
  );
}
