"use client";

import {
  CircleAlertIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Route } from "next";

import { DateTime } from "@/components/format/date-time";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { type AdminNotification, notificationTarget } from "./api";

const TYPE_ICON = {
  success: { icon: CircleCheckIcon, className: "text-success" },
  info: { icon: InfoIcon, className: "text-info" },
  warning: { icon: TriangleAlertIcon, className: "text-warning" },
  error: { icon: CircleAlertIcon, className: "text-destructive" },
} as const;

/** What a notification points at, in words, for the "open" affordance. */
const TARGET_LABEL: Record<string, string> = {
  user: "Open customer",
  transaction: "Open transaction",
  case: "Open case",
  alert: "Open alert",
  kyc: "Open KYC review",
  supportMessage: "Open message",
  chatRoom: "Open conversation",
  stranded: "Open stranded transfers",
  treasury: "Open treasury",
};

interface Props {
  notification: AdminNotification;
  /** Called with the resolved console route, or null when it points nowhere. */
  onActivate: (notification: AdminNotification, href: Route | null) => void;
  /** The full-page list shows the whole body; the bell clamps it. */
  expanded?: boolean;
}

/**
 * One notification, as a button.
 *
 * A button rather than a Link even when it has a target: activating it both
 * marks it read and navigates, and the navigation is conditional on the target
 * resolving. Wrapping an `<a>` whose href may be null in a click handler that
 * sometimes preventDefaults is the version of this with two ways to behave.
 * Keyboard and screen-reader users get the same single control either way, and
 * the destination is named in the accessible label rather than left to the icon.
 */
export function NotificationRow({ notification, onActivate, expanded = false }: Props) {
  const { icon: Icon, className } = TYPE_ICON[notification.type];
  const href = notificationTarget(notification);
  const targetLabel = notification.entityType
    ? (TARGET_LABEL[notification.entityType] ?? "Open")
    : "Open";

  return (
    <button
      type="button"
      className={cn(
        "flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        !notification.read && "bg-accent/30",
        href && "cursor-pointer",
      )}
      aria-label={
        href ? `${notification.title}. ${targetLabel}.` : `${notification.title}. Mark as read.`
      }
      onClick={() => {
        onActivate(notification, href);
      }}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("min-w-0", expanded ? "break-words" : "truncate")}>
            {notification.title}
          </span>
          {notification.priority === "high" && <Badge tone="danger">High</Badge>}
          {!notification.read && <span className="sr-only">(unread)</span>}
        </span>
        <span
          className={cn(
            "text-xs whitespace-pre-line text-muted-foreground",
            expanded ? "break-words" : "line-clamp-2",
          )}
        >
          {notification.body}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <DateTime value={notification.createdAt} format="relative" />
          {href && (
            <span className="flex items-center gap-1 text-foreground">
              <ExternalLinkIcon className="size-3" aria-hidden />
              {targetLabel}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
