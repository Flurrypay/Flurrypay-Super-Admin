"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, BellIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/features/auth/admin-context";
import { getUserMessage } from "@/lib/api/errors";

import {
  type AdminNotification,
  BELL_LIMIT,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api";
import { NotificationRow } from "./notification-row";

const queryKey = ["admin-notifications"] as const;

export function NotificationsPopover() {
  const admin = useAdmin();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchNotifications(signal),
    refetchInterval: 60_000,
  });

  // The API returns newest first and caps the page, so the bell only filters to
  // this admin's role. `targetRole` is advisory — the API hides nothing by it —
  // so this is presentation, not access control.
  const items = useMemo(
    () =>
      (query.data?.rows ?? []).filter((n) => n.targetRole === "all" || n.targetRole === admin.role),
    [query.data, admin.role],
  );
  // From the API, so the badge counts every unread notification rather than the
  // unread ones that happened to fit on the bell's page.
  const unread = query.data?.unread ?? 0;
  const total = query.data?.total ?? 0;

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onMutate: (id) => {
      queryClient.setQueryData<{
        rows: AdminNotification[];
        total: number;
        unread: number;
      }>(queryKey, (current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((n) => (n.id === id ? { ...n, read: true } : n)),
              unread: Math.max(0, current.unread - 1),
            }
          : current,
      );
    },
    onError: (error) => {
      toast.error(getUserMessage(error));
      void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications-page"] });
    },
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["admin-notifications-page"] });
    },
    onError: (error) => toast.error(getUserMessage(error)),
  });

  /**
   * Opening a notification marks it read and goes where it points.
   *
   * Marking happens either way: the admin has now seen it, and leaving it unread
   * because it had nowhere to go means the badge never clears for exactly the
   * notifications nobody can act on.
   */
  function activate(notification: AdminNotification, href: Route | null) {
    if (!notification.read) markOne.mutate(notification.id);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-tour="notifications">
          <BellIcon aria-hidden />
          <span className="sr-only">Notifications{unread > 0 ? `, ${unread} unread` : ""}</span>
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-medium">
            Notifications
            {unread > 0 && (
              <span className="ml-1.5 font-normal text-muted-foreground">{unread} unread</span>
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              markAll.mutate();
            }}
            disabled={unread === 0 || markAll.isPending}
          >
            Mark all read
          </Button>
        </div>
        {query.isPending && (
          <div className="grid gap-3 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}
        {query.isError && (
          <ErrorState
            error={query.error}
            subject="notifications"
            onRetry={() => void query.refetch()}
            className="py-6"
          />
        )}
        {query.isSuccess && items.length === 0 && (
          <EmptyState
            icon={BellIcon}
            title="You're all caught up"
            description="System events such as failed payouts and security alerts appear here."
            className="py-8"
          />
        )}
        {items.length > 0 && (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((notification) => (
              <li key={notification.id}>
                <NotificationRow notification={notification} onActivate={activate} />
              </li>
            ))}
          </ul>
        )}
        {/*
          Always present, even on an empty inbox: the full list is also where
          read history lives, and "nothing unread" is not the same as "nothing
          ever happened". The count tells the admin whether the bell is showing
          them everything or only the newest page.
        */}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {total > items.length
              ? `Showing the newest ${items.length} of ${total}`
              : "All notifications are shown"}
          </span>
          <Button
            asChild
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => {
              setOpen(false);
            }}
          >
            <Link href="/notifications">
              View all
              <ArrowRightIcon aria-hidden />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Kept in sync with the bell's page size, for the "showing N of M" line above. */
export { BELL_LIMIT };
