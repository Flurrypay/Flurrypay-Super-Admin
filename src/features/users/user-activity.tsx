"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ActivityIcon } from "lucide-react";
import { useState } from "react";

import { Pagination } from "@/components/data-table/pagination";
import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizeEnum } from "@/lib/format";

import { fetchUserActivity } from "./api";

const SECURITY_ACTIONS =
  /LOGIN_FAILED|NEW_DEVICE|LOCKED|PIN_FAILED|SESSION_REVOKED|TWO_FA_DISABLED|PASSWORD/;

/** The customer's own activity log: sign-ins, security changes, KYC and money movement. */
export function UserActivity({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const result = useQuery({
    queryKey: ["user-activity", userId, page, pageSize],
    queryFn: ({ signal }) =>
      fetchUserActivity(userId, { limit: pageSize, offset: (page - 1) * pageSize }, signal),
    placeholderData: keepPreviousData,
  });

  if (result.isPending) return <Skeleton className="h-64" />;
  if (result.isError)
    return (
      <ErrorState error={result.error} subject="activity" onRetry={() => void result.refetch()} />
    );
  if (result.data.total === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No recorded activity"
        description="Sign-ins, security changes and transactions are logged here as the customer uses the app."
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Freshness
          updatedAt={result.dataUpdatedAt}
          isFetching={result.isFetching}
          onRefresh={() => void result.refetch()}
        />
      </div>
      <ol className="divide-y rounded-md border bg-card" aria-label="Customer activity">
        {result.data.logs.map((log) => (
          <li
            key={log.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm"
          >
            <DateTime value={log.createdAt} className="w-40 text-muted-foreground" />
            <Badge tone={SECURITY_ACTIONS.test(log.action) ? "warning" : "neutral"}>
              {humanizeEnum(log.action)}
            </Badge>
            {log.ipAddress && (
              <span className="font-mono text-xs text-muted-foreground">{log.ipAddress}</span>
            )}
            {log.location && <span className="text-xs text-muted-foreground">{log.location}</span>}
            {log.deviceInfo && (
              <span className="truncate text-xs text-muted-foreground">{log.deviceInfo}</span>
            )}
          </li>
        ))}
      </ol>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={result.data.total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
