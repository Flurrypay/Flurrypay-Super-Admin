"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardListIcon,
  ClockIcon,
  HourglassIcon,
  LoaderCircleIcon,
  ScaleIcon,
  ScanFaceIcon,
  ShieldAlertIcon,
  UserPlusIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuditLog } from "@/features/audit/api";
import { auditActionInfo } from "@/features/audit/labels";
import { useAdmin } from "@/features/auth/admin-context";
import { hasPermission } from "@/features/auth/permissions";
import { fetchComplianceDashboard } from "@/features/compliance/api";
import { fetchKycQueue } from "@/features/kyc/api";
import { fetchStrandedSummary } from "@/features/operations/api";
import { fetchUsersReport } from "@/features/reports/api";
import { fetchRiskOverview } from "@/features/risk/api";
import { countTransactions, fetchTransactions } from "@/features/transactions/api";
import { transactionTypeLabel } from "@/features/transactions/labels";
import { addDaysToDateString, startOfZonedDay, toZonedDateString } from "@/lib/date";

import { Metric } from "./metric";

/** Answers: what needs attention, what is failing, what changed recently. */
export function OverviewView() {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const canTx = hasPermission(admin, "transactions.view");
  const canKyc = hasPermission(admin, "kyc.review");
  const canUsers = hasPermission(admin, "users.view");
  const canAudit = hasPermission(admin, "auditLogs.view");
  const canCompliance = hasPermission(admin, "compliance.review");

  // "Today" in WAT, matching the Transactions page's "Today" filter the metric links to.
  const [todayStart] = useState(() => startOfZonedDay(toZonedDateString(new Date())).toISOString());

  const counts = useQueries({
    queries: [
      { status: "FAILED" as const, from: todayStart },
      { status: "PENDING" as const },
      { status: "PROCESSING" as const },
    ].map((filter) => ({
      queryKey: ["overview", "tx-count", filter],
      queryFn: ({ signal }: { signal: AbortSignal }) => countTransactions(filter, signal),
      enabled: canTx,
    })),
  });
  const [failed24h, pending, processing] = counts;

  const kyc = useQuery({
    queryKey: ["kyc-queue", "pending"],
    queryFn: ({ signal }) => fetchKycQueue({ filter: "pending", page: 1, pageSize: 1 }, signal),
    enabled: canKyc,
  });
  const kycAwaiting = kyc.data?.total;

  // Last 7 WAT calendar days including today; fixed at mount like `todayStart`.
  const [weekStart] = useState(() =>
    startOfZonedDay(addDaysToDateString(toZonedDateString(new Date()), -6)).toISOString(),
  );
  const users = useQuery({
    queryKey: ["overview", "users-report", weekStart],
    queryFn: ({ signal }) =>
      fetchUsersReport({ from: weekStart, to: new Date().toISOString() }, signal),
    enabled: canUsers,
  });
  const newUsers = users.data?.signups.reduce((sum, day) => sum + day.count, 0);

  const stranded = useQuery({
    queryKey: ["overview", "stranded"],
    queryFn: ({ signal }) => fetchStrandedSummary(signal),
    enabled: canTx,
  });
  const compliance = useQuery({
    queryKey: ["overview", "compliance"],
    queryFn: ({ signal }) => fetchComplianceDashboard(signal),
    enabled: canCompliance,
  });
  const risk = useQuery({
    queryKey: ["overview", "risk"],
    queryFn: ({ signal }) => fetchRiskOverview(signal),
    enabled: canCompliance,
  });

  const recentFailures = useQuery({
    queryKey: ["overview", "recent-failures"],
    queryFn: ({ signal }) => fetchTransactions({ page: 1, pageSize: 6, status: "FAILED" }, signal),
    enabled: canTx,
  });
  const recentAudit = useQuery({
    queryKey: ["overview", "recent-audit"],
    queryFn: ({ signal }) => fetchAuditLog({ page: 1, pageSize: 8 }, signal),
    enabled: canAudit,
  });

  const tracked = [
    ...counts,
    kyc,
    users,
    stranded,
    compliance,
    risk,
    recentFailures,
    recentAudit,
  ].filter((q) => q.fetchStatus !== "idle" || q.isSuccess);
  const loadedAt = tracked.map((q) => q.dataUpdatedAt).filter((t) => t > 0);
  // The oldest of the loaded sections, so "Updated …" never overstates freshness.
  const updatedAt = loadedAt.length > 0 ? Math.min(...loadedAt) : 0;
  const isFetching = tracked.some((q) => q.isFetching);
  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
      queryClient.invalidateQueries({ queryKey: ["kyc-queue"] }),
    ]);

  const hasAnyModule = canTx || canKyc || canUsers || canAudit || canCompliance;

  return (
    <div className="grid gap-5">
      <PageHeader
        title={`Welcome back, ${admin.firstName}`}
        description="What needs attention across FlurryPay right now."
        actions={
          hasAnyModule && (
            <Freshness
              updatedAt={updatedAt}
              isFetching={isFetching}
              onRefresh={() => void refreshAll()}
            />
          )
        }
      />

      {(!admin.hasActivated2FA || !admin.pinIsSet) && (
        <Alert tone="warning">
          <ShieldAlertIcon aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-foreground">
            Finish securing your account: sensitive actions need two-factor authentication and a
            transaction PIN.
            <Button asChild size="sm" variant="outline">
              <Link href="/security">Open security settings</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {hasAnyModule ? (
        <section
          aria-label="Needs attention"
          className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"
        >
          {canTx && failed24h && pending && processing && (
            <>
              <Metric
                label="Failed · today"
                value={failed24h.data}
                icon={XCircleIcon}
                attention
                isPending={failed24h.isPending}
                isError={failed24h.isError}
                definition="Transactions with status Failed created today (since midnight WAT)."
                href={"/transactions?status=FAILED&range=today"}
              />
              <Metric
                label="Processing"
                value={processing.data}
                icon={LoaderCircleIcon}
                attention
                isPending={processing.isPending}
                isError={processing.isError}
                definition="All transactions submitted to a provider and awaiting a result, any age. Old ones may be stuck."
                href={"/transactions?status=PROCESSING&sort=createdAt&dir=asc"}
              />
              <Metric
                label="Pending"
                value={pending.data}
                icon={ClockIcon}
                attention
                isPending={pending.isPending}
                isError={pending.isError}
                definition="All transactions created but not yet processed, any age."
                href={"/transactions?status=PENDING&sort=createdAt&dir=asc"}
              />
            </>
          )}
          {canTx && (
            <Metric
              label="Stranded transfers"
              value={stranded.data?.count}
              icon={HourglassIcon}
              attention
              isPending={stranded.isPending}
              isError={stranded.isError}
              definition="Customers debited for transfers that were neither delivered nor returned."
              href="/operations/stranded"
            />
          )}
          {canCompliance && (
            <>
              <Metric
                label="Open compliance alerts"
                value={compliance.data?.alerts.open}
                icon={ShieldAlertIcon}
                attention
                isPending={compliance.isPending}
                isError={compliance.isError}
                definition="Monitoring alerts open or under review."
                href="/compliance?status=OPEN"
              />
              <Metric
                label="Open risk cases"
                value={
                  risk.data ? risk.data.cases.open + risk.data.cases.awaitingCustomer : undefined
                }
                icon={ScaleIcon}
                attention
                isPending={risk.isPending}
                isError={risk.isError}
                definition="Risk cases open or waiting for the customer."
                href="/risk"
              />
            </>
          )}
          {canKyc && (
            <Metric
              label="KYC awaiting review"
              value={kycAwaiting}
              icon={ScanFaceIcon}
              attention
              isPending={kyc.isPending}
              isError={kyc.isError}
              definition="Customers with at least one KYC level pending, as in the KYC queue’s “Awaiting review” view."
              href="/kyc"
            />
          )}
          {canUsers && (
            <>
              <Metric
                label="New customers · 7 days"
                value={newUsers}
                icon={UserPlusIcon}
                isPending={users.isPending}
                isError={users.isError}
                definition="Accounts created in the last 7 calendar days (WAT), including today."
                href={"/users?sort=createdAt&dir=desc"}
              />
              <Metric
                label="Total customers"
                value={users.data?.totals.total}
                icon={UsersIcon}
                isPending={users.isPending}
                isError={users.isError}
                definition="All customer accounts, including restricted ones."
                href="/users"
              />
            </>
          )}
        </section>
      ) : (
        <EmptyState
          icon={ShieldAlertIcon}
          title="No modules assigned yet"
          description="Your account has no permissions. Ask a super admin to grant the access your role needs."
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {canTx && (
          <section className="rounded-md border bg-card" aria-labelledby="recent-failures">
            <header className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 id="recent-failures" className="text-sm font-medium">
                Latest failed transactions
              </h2>
              <Link
                href={"/transactions?status=FAILED"}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </header>
            {recentFailures.isPending ? (
              <div className="grid gap-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : recentFailures.isError ? (
              <ErrorState
                error={recentFailures.error}
                subject="failed transactions"
                onRetry={() => void recentFailures.refetch()}
                className="py-8"
              />
            ) : recentFailures.data.rows.length === 0 ? (
              <EmptyState
                icon={XCircleIcon}
                title="No failed transactions"
                description="Failures appear here as soon as they are recorded."
                className="py-8"
              />
            ) : (
              <ul className="divide-y">
                {recentFailures.data.rows.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-medium">
                        {transactionTypeLabel(tx.transactionType)}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {tx.failureReason ?? "No reason recorded"}
                        {tx.user ? ` · ${tx.user.email}` : ""}
                      </span>
                    </span>
                    <Amount value={tx.amount} currency={tx.currency} />
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {tx.reference ? (
                        <Link
                          href={`/transactions/${encodeURIComponent(tx.reference)}`}
                          className="hover:underline"
                        >
                          <DateTime value={tx.createdAt} format="relative" />
                        </Link>
                      ) : (
                        <DateTime value={tx.createdAt} format="relative" />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {canAudit && (
          <section className="rounded-md border bg-card" aria-labelledby="recent-audit">
            <header className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 id="recent-audit" className="text-sm font-medium">
                Recent administrator activity
              </h2>
              <Link href="/audit" className="text-xs text-muted-foreground hover:text-foreground">
                Audit log
              </Link>
            </header>
            {recentAudit.isPending ? (
              <div className="grid gap-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : recentAudit.isError ? (
              <ErrorState
                error={recentAudit.error}
                subject="recent activity"
                onRetry={() => void recentAudit.refetch()}
                className="py-8"
              />
            ) : recentAudit.data.rows.length === 0 ? (
              <EmptyState
                icon={ClipboardListIcon}
                title="No activity recorded"
                description="Administrator actions will appear here."
                className="py-8"
              />
            ) : (
              <ul className="divide-y">
                {recentAudit.data.rows.map((entry) => {
                  const info = auditActionInfo(entry.action);
                  return (
                    <li key={entry.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <Badge tone={info.tone}>{info.label}</Badge>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {entry.adminEmail}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <DateTime value={entry.createdAt} format="relative" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
