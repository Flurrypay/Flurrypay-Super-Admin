"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CircleHelpIcon,
  ClockIcon,
  LogOutIcon,
  MenuIcon,
  RouteIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PREVIEW_MODE } from "@/config/preview";
import { useAdmin } from "@/features/auth/admin-context";
import { signOut } from "@/features/auth/api";
import { ROLE_INFO } from "@/features/auth/permissions";
import { sessionStore, useSessionState } from "@/features/auth/session";
import { NotificationsPopover } from "@/features/notifications/notifications-popover";
import { cn } from "@/lib/utils";
import { useConsoleUi } from "@/stores/console-ui-store";

export function Header({ onStartTour }: { onStartTour: () => void }) {
  const admin = useAdmin();
  const setPaletteOpen = useConsoleUi((s) => s.setPaletteOpen);
  const setHelpOpen = useConsoleUi((s) => s.setHelpOpen);
  const setMobileNavOpen = useConsoleUi((s) => s.setMobileNavOpen);

  const logout = useMutation({
    mutationFn: signOut,
    // End the local session whether or not the API call succeeds.
    onSettled: () => {
      sessionStore.end("signed-out");
    },
  });

  return (
    <header className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => {
          setMobileNavOpen(true);
        }}
      >
        <MenuIcon aria-hidden />
        <span className="sr-only">Open navigation</span>
      </Button>

      <button
        type="button"
        data-tour="search"
        onClick={() => {
          setPaletteOpen(true);
        }}
        className="flex h-8 w-full max-w-sm min-w-0 items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground"
      >
        <SearchIcon className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">Search customers, references, pages…</span>
        <span className="hidden gap-0.5 sm:flex" aria-hidden>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <SecurityStatus hasTwoFactor={admin.hasActivated2FA} pinIsSet={admin.pinIsSet} />
        {PREVIEW_MODE ? <PreviewBadge /> : <SessionCountdown />}
        <NotificationsPopover />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2" data-tour="account">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold"
              >
                {admin.firstName.charAt(0)}
                {admin.lastName.charAt(0)}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-medium">{admin.firstName}</span>
                <span className="block text-xs text-muted-foreground">
                  {ROLE_INFO[admin.role].label}
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="grid gap-0.5 text-foreground">
              <span className="text-sm">
                {admin.firstName} {admin.lastName}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {admin.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/security">
                <UserIcon aria-hidden />
                Security settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setHelpOpen(true);
              }}
            >
              <CircleHelpIcon aria-hidden />
              Help & shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onStartTour}>
              <RouteIcon aria-hidden />
              Restart tour
            </DropdownMenuItem>
            {!PREVIEW_MODE && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    logout.mutate();
                  }}
                  disabled={logout.isPending}
                >
                  <LogOutIcon aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function PreviewBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge tone="warning" tabIndex={0} className="mr-1 cursor-default">
          Preview · sample data
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        Not connected to the FlurryPay API. Everything shown is built-in sample data, and changes
        last only until the page is reloaded. Set NEXT_PUBLIC_PREVIEW_MODE=false to use the real API
        and sign-in.
      </TooltipContent>
    </Tooltip>
  );
}

function SecurityStatus({ hasTwoFactor, pinIsSet }: { hasTwoFactor: boolean; pinIsSet: boolean }) {
  const secure = hasTwoFactor && pinIsSet;
  const issues = [
    !hasTwoFactor && "two-factor authentication is off",
    !pinIsSet && "no transaction PIN is set",
  ].filter(Boolean);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/security"
          data-tour="security-status"
          className="hidden rounded-md p-1.5 hover:bg-muted sm:inline-flex"
          aria-label={
            secure ? "Account security: protected" : `Account security: ${issues.join(" and ")}`
          }
        >
          {secure ? (
            <ShieldCheckIcon className="size-4 text-success" aria-hidden />
          ) : (
            <Badge tone="warning">
              <ShieldAlertIcon aria-hidden />
              Action needed
            </Badge>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        {secure
          ? "Two-factor authentication and transaction PIN are set."
          : `Your ${issues.join(" and ")}. Sensitive actions will be refused until fixed.`}
      </TooltipContent>
    </Tooltip>
  );
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** Sessions are fixed 2-hour tokens with no renewal, so the remaining time is shown. */
function SessionCountdown() {
  const { session } = useSessionState();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  if (!session) return null;
  const remaining = session.expiresAt - now;
  const low = remaining < 10 * 60_000;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "hidden items-center gap-1 rounded-md px-1.5 py-1 text-xs tabular-nums md:inline-flex",
            low ? "text-warning" : "text-muted-foreground",
          )}
        >
          <ClockIcon className="size-3.5" aria-hidden />
          {formatRemaining(remaining)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Session ends in {formatRemaining(remaining)}. It renews automatically while you are working,
        up to 12 hours after you signed in.
      </TooltipContent>
    </Tooltip>
  );
}
