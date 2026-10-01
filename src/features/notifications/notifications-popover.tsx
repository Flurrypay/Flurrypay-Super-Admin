"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/features/auth/admin-context";
import { getUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

import {
  type AdminNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api";

const MAX_SHOWN = 30;
const queryKey = ["admin-notifications"] as const;

const TYPE_ICON = {
  success: { icon: CircleCheckIcon, className: "text-success" },
  info: { icon: InfoIcon, className: "text-info" },
  warning: { icon: TriangleAlertIcon, className: "text-warning" },
  error: { icon: CircleAlertIcon, className: "text-destructive" },
} as const;

export function NotificationsPopover() {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchNotifications(signal),
    refetchInterval: 60_000,
  });

  // Newest first, limited to notifications addressed to this admin's role.
  const items = useMemo(
    () =>
      (query.data ?? [])
        .filter((n) => n.targetRole === "all" || n.targetRole === admin.role)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_SHOWN),
    [query.data, admin.role],
  );
  const unread = items.filter((n) => !n.read).length;

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onMutate: (id) => {
      queryClient.setQueryData<AdminNotification[]>(queryKey, (current) =>
        current?.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    },
    onError: (error) => {
      toast.error(getUserMessage(error));
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast.error(getUserMessage(error)),
  });

  return (
    <Popover>
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
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
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
            {items.map((notification) => {
              const { icon: Icon, className } = TYPE_ICON[notification.type];
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      !notification.read && "bg-accent/30",
                    )}
                    onClick={() => {
                      if (!notification.read) markOne.mutate(notification.id);
                    }}
                  >
                    <Icon
                      className={cn("mt-0.5 size-4 shrink-0", className)}
                      aria-label={notification.type}
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{notification.title}</span>
                        {notification.priority === "high" && <Badge tone="danger">High</Badge>}
                        {!notification.read && <span className="sr-only">(unread)</span>}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {notification.body}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <DateTime value={notification.createdAt} format="relative" />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
