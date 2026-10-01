"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { parseAsBoolean, parseAsInteger, useQueryStates } from "nuqs";
import { toast } from "sonner";

import { Pagination } from "@/components/data-table/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/features/auth/admin-context";
import { getUserMessage } from "@/lib/api/errors";

import {
  type AdminNotification,
  fetchNotificationPage,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api";
import { NotificationRow } from "./notification-row";

/**
 * Everything the bell could not hold.
 *
 * The bell shows the newest page and nothing else, which is correct for a
 * popover and useless for the two questions that actually get asked: "what came
 * in while I was away?" and "what did that alert last Tuesday say?". Those need
 * paging and read history, and neither belongs in a dropdown.
 */
export function NotificationsView() {
  const admin = useAdmin();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(25),
      unread: parseAsBoolean.withDefault(false),
    },
    { clearOnDefault: true },
  );

  const query = {
    page: state.page,
    pageSize: Math.min(state.size, 100),
    unreadOnly: state.unread,
  };
  const result = useQuery({
    queryKey: ["admin-notifications-page", query],
    queryFn: ({ signal }) => fetchNotificationPage(query, signal),
    placeholderData: keepPreviousData,
  });

  // Same role filter as the bell: presentation, not access control — the API
  // hides nothing by `targetRole`.
  const rows = (result.data?.rows ?? []).filter(
    (n) => n.targetRole === "all" || n.targetRole === admin.role,
  );
  const unread = result.data?.unread ?? 0;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["admin-notifications-page"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  }

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
    onError: (error) => toast.error(getUserMessage(error)),
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      toast.success("All notifications marked as read");
      invalidate();
    },
    onError: (error) => toast.error(getUserMessage(error)),
  });

  function activate(notification: AdminNotification, href: Route | null) {
    if (!notification.read) markOne.mutate(notification.id);
    if (href) router.push(href);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          A toggle rather than a filter dropdown: there are exactly two states
          anyone wants, and the unread one is the reason they opened this page.
        */}
        <Button
          variant={state.unread ? "primary" : "outline"}
          size="sm"
          aria-pressed={state.unread}
          onClick={() => void setState({ unread: !state.unread || null, page: 1 })}
        >
          Unread only
          {unread > 0 && (
            <span className="ml-1 rounded-full bg-background/20 px-1.5 text-xs">{unread}</span>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            markAll.mutate();
          }}
          disabled={unread === 0 || markAll.isPending}
        >
          <CheckCheckIcon aria-hidden />
          Mark all read
        </Button>
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>

      {result.isPending && (
        <div className="grid gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {result.isError && (
        <ErrorState
          error={result.error}
          subject="notifications"
          onRetry={() => void result.refetch()}
        />
      )}

      {result.isSuccess && rows.length === 0 && (
        <EmptyState
          icon={BellIcon}
          title={state.unread ? "Nothing unread" : "No notifications"}
          description={
            state.unread
              ? "Everything addressed to you has been read."
              : "System events such as failed payouts, KYC submissions and security alerts appear here."
          }
          action={
            state.unread ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void setState({ unread: null, page: 1 })}
              >
                Show all
              </Button>
            ) : undefined
          }
        />
      )}

      {rows.length > 0 && (
        <ul className="divide-y rounded-md border bg-card">
          {rows.map((notification) => (
            <li key={notification.id}>
              <NotificationRow notification={notification} onActivate={activate} expanded />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={state.page}
        pageSize={query.pageSize}
        total={result.data?.total ?? 0}
        onPageChange={(page) => void setState({ page })}
        onPageSizeChange={(size) => void setState({ size: Math.min(size, 100), page: 1 })}
      />
    </div>
  );
}
