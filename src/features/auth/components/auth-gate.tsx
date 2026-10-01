"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";
import { PREVIEW_MODE } from "@/config/preview";
import { AuthenticationError } from "@/lib/api/errors";

import { AdminProvider } from "../admin-context";
import { fetchCurrentAdmin } from "../api";
import { sessionStore, useHasHydrated, useSessionState } from "../session";
import { useSessionKeepAlive } from "../use-session-keepalive";
import { RequireTwoFactor } from "./require-two-factor";

export const currentAdminQueryKey = ["current-admin"] as const;

const PREVIEW_SESSION = { token: "preview", expiresAt: Number.MAX_SAFE_INTEGER };

/**
 * Guards the console: requires a live session and resolves the current admin
 * (role, permissions, security status) before rendering anything.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session: realSession } = useSessionState();
  // Preview mode has no sign-in: the console opens as a sample super admin.
  const session = PREVIEW_MODE ? PREVIEW_SESSION : realSession;
  const hydrated = useHasHydrated();
  const router = useRouter();
  useSessionKeepAlive();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const admin = useQuery({
    queryKey: currentAdminQueryKey,
    queryFn: ({ signal }) => fetchCurrentAdmin(signal),
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!hydrated || session) return;
    // Drop every cached response so nothing from this session outlives it.
    queryClient.clear();
    const query = searchParams.toString();
    const next = `${pathname}${query ? `?${query}` : ""}`;
    router.replace(`/login?next=${encodeURIComponent(next)}` as Route);
  }, [hydrated, session, pathname, searchParams, router, queryClient]);

  // Tokens last 2 hours (renewed while active, see useSessionKeepAlive); end the session exactly at expiry.
  useEffect(() => {
    if (!session || PREVIEW_MODE) return;
    const timeout = window.setTimeout(
      () => {
        sessionStore.end("expired");
      },
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => {
      window.clearTimeout(timeout);
    };
  }, [session]);

  if (!session || admin.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading your workspace</span>
      </div>
    );
  }

  if (admin.isError) {
    if (admin.error instanceof AuthenticationError) return null;
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState
          error={admin.error}
          subject="your account"
          onRetry={() => void admin.refetch()}
        />
      </div>
    );
  }

  // Two-factor authentication is a condition of holding a session, not a
  // preference — the API refuses every console route to an account without it
  // (verifyAdminToken, code ADMIN_2FA_REQUIRED). Showing enrolment here rather
  // than the dashboard is what turns that from a screenful of unexplained 403s
  // into one instruction. Preview mode has no API behind it and no enrolment
  // to complete, so it is exempt.
  if (!PREVIEW_MODE && !admin.data.hasActivated2FA) {
    return <RequireTwoFactor email={admin.data.email} />;
  }

  return <AdminProvider admin={admin.data}>{children}</AdminProvider>;
}
