"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/states/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sessionStore } from "@/features/auth/session";
import { confirmTotpEnrolment, startTotpEnrolment } from "@/features/security/api";

import { signOut } from "../api";
import { currentAdminQueryKey } from "./auth-gate";
import { TotpEnrolment } from "./totp-enrolment";

/**
 * The console, replaced by authenticator enrolment.
 *
 * Two-factor authentication is a condition of holding an admin session, not a
 * setting — the API refuses to issue a token without it and closes every route
 * except enrolment to a session that predates the rule. Rendering this instead
 * of the dashboard is what makes that visible rather than confusing: an admin
 * in this state would otherwise meet a wall of identical 403s on every screen
 * with no way to work out what to do about them.
 *
 * There is no "skip" and no "later". This screen has exactly two exits —
 * finish enrolling, or sign out.
 */
export function RequireTwoFactor({ email }: { email: string }) {
  const queryClient = useQueryClient();
  // Fetched once and cached: re-running enrolment would mint a different
  // secret, so an admin who had already scanned the QR code would find their
  // authenticator producing codes for a secret the server no longer holds.
  const enrolment = useQuery({
    queryKey: ["totp-enrolment"],
    queryFn: () => startTotpEnrolment(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-start gap-6 px-4 py-12">
      <header className="grid gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold">Set up two-factor authentication</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Every administrator account needs an authenticator app. Until yours is set up, the console
          is closed — including to you, signed in as {email}.
        </p>
      </header>

      <Alert>
        <AlertDescription>
          Once enrolled, generate recovery codes from Settings → Security and keep them somewhere
          other than your phone. They are the only way back in if you lose the device.
        </AlertDescription>
      </Alert>

      {enrolment.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
          Preparing your enrolment…
        </div>
      )}

      {enrolment.isError && (
        <ErrorState
          error={enrolment.error}
          subject="two-factor setup"
          onRetry={() => void enrolment.refetch()}
        />
      )}

      {enrolment.data && (
        <TotpEnrolment
          otpauth={enrolment.data.otpauth}
          secret={enrolment.data.secret}
          submitLabel="Verify and continue"
          onVerify={async (code) => {
            await confirmTotpEnrolment(code);
            toast.success("Two-factor authentication is on.");
            // Re-reads the admin, which now reports hasActivated2FA — the gate
            // then renders the console in place of this screen.
            await queryClient.invalidateQueries({ queryKey: currentAdminQueryKey });
          }}
        />
      )}

      <Button
        type="button"
        variant="ghost"
        className="w-fit"
        onClick={() => {
          // Ends the server session too, not just this tab's copy of the
          // token — leaving a live session behind for an account that cannot
          // reach anything is how a half-enrolled admin ends up wondering why
          // they are "still signed in somewhere".
          void signOut()
            .catch(() => undefined)
            .finally(() => {
              sessionStore.end("signed-out");
            });
        }}
      >
        Sign out instead
      </Button>
    </main>
  );
}
