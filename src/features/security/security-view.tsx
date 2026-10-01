"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRoundIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SmartphoneIcon,
} from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { toast } from "sonner";

import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { DateTime } from "@/components/format/date-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdmin } from "@/features/auth/admin-context";
import { currentAdminQueryKey } from "@/features/auth/components/auth-gate";
import { TotpEnrolment } from "@/features/auth/components/totp-enrolment";
import { ROLE_INFO } from "@/features/auth/permissions";
import { useSessionState } from "@/features/auth/session";
import { toAppError } from "@/lib/api/errors";

import {
  changeTransactionPin,
  confirmTotpEnrolment,
  disableTotp,
  setTransactionPin,
  startTotpEnrolment,
} from "./api";
import { RecoveryCodesSection } from "./recovery-codes-section";

const PIN = /^\d{6}$/;

export function SecurityView() {
  const admin = useAdmin();
  const { session } = useSessionState();
  const queryClient = useQueryClient();
  const refreshAdmin = () => queryClient.invalidateQueries({ queryKey: currentAdminQueryKey });

  return (
    <div className="grid max-w-3xl gap-4">
      {(!admin.hasActivated2FA || !admin.pinIsSet) && (
        <Alert tone="warning">
          <ShieldOffIcon aria-hidden />
          <AlertDescription className="text-foreground">
            Sensitive actions (inviting administrators, changing permissions, moving funds) are
            refused until two-factor authentication{" "}
            {admin.pinIsSet ? "is enabled" : "and a transaction PIN are set up"}.
          </AlertDescription>
        </Alert>
      )}

      <DetailSection title="Account & session">
        <DetailList
          items={[
            { label: "Name", value: `${admin.firstName} ${admin.lastName}` },
            { label: "Email", value: admin.email },
            { label: "Role", value: ROLE_INFO[admin.role].label },
            {
              label: "Phone",
              value: admin.phoneNumber ? (
                <span className="font-mono text-xs">{admin.phoneNumber}</span>
              ) : null,
            },
            {
              label: "Trusted devices",
              value: <span className="tabular-nums">{admin.trustedDeviceCount}</span>,
              hint: "Browsers this account is bound to. A new browser requires email and SMS verification.",
            },
            {
              label: "Session ends",
              value: session ? <DateTime value={new Date(session.expiresAt)} /> : null,
              hint: "Tokens last 2 hours and renew while you are working, up to 12 hours after signing in.",
            },
          ]}
        />
      </DetailSection>

      <TwoFactorSection
        enabled={admin.hasActivated2FA}
        pinIsSet={admin.pinIsSet}
        onChanged={refreshAdmin}
      />
      <PinSection pinIsSet={admin.pinIsSet} onChanged={refreshAdmin} />
      <RecoveryCodesSection
        twoFactorEnabled={admin.hasActivated2FA}
        remaining={admin.recoveryCodesRemaining}
        onChanged={refreshAdmin}
      />
    </div>
  );
}

function TwoFactorSection({
  enabled,
  pinIsSet,
  onChanged,
}: {
  enabled: boolean;
  pinIsSet: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [enrolment, setEnrolment] = useState<{ secret: string; otpauth: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const start = useMutation({
    mutationFn: startTotpEnrolment,
    onSuccess: setEnrolment,
    onError: (error) => toast.error(toAppError(error).userMessage),
  });

  return (
    <DetailSection
      title="Two-factor authentication"
      description="An authenticator app code is required at sign-in and for sensitive actions."
      actions={
        <Badge tone={enabled ? "success" : "warning"}>
          {enabled ? <ShieldCheckIcon aria-hidden /> : <ShieldOffIcon aria-hidden />}
          {enabled ? "Enabled" : "Not enabled"}
        </Badge>
      }
    >
      {!enabled && !enrolment && (
        <Button
          onClick={() => {
            start.mutate();
          }}
          disabled={start.isPending}
        >
          {start.isPending ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden />
          ) : (
            <SmartphoneIcon aria-hidden />
          )}
          Set up authenticator app
        </Button>
      )}
      {!enabled && enrolment && (
        <TotpEnrolment
          otpauth={enrolment.otpauth}
          secret={enrolment.secret}
          onVerify={async (code) => {
            await confirmTotpEnrolment(code);
            toast.success("Two-factor authentication enabled");
            setEnrolment(null);
            await onChanged();
          }}
        />
      )}
      {enabled && !disabling && (
        <div className="grid gap-2 text-sm">
          <p className="text-muted-foreground">
            To move to a new phone, disable two-factor authentication and set it up again. Disabling
            needs your current code and transaction PIN.
          </p>
          <p className="text-muted-foreground">
            The console closes the moment it is off — two-factor authentication is a condition of
            holding an administrator session, not a setting. You will be taken straight to enrolment
            and everything else stays shut until you finish it, so do this only with the new phone
            already in your hand.
          </p>
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => {
              setDisabling(true);
            }}
            disabled={!pinIsSet}
          >
            Disable two-factor authentication
          </Button>
          {!pinIsSet && (
            <p className="text-xs text-muted-foreground">Set a transaction PIN first.</p>
          )}
        </div>
      )}
      {enabled && disabling && (
        <DisableTwoFactorForm
          onCancel={() => {
            setDisabling(false);
          }}
          onDone={async () => {
            setDisabling(false);
            toast.success("Two-factor authentication disabled — set it up again to continue.");
            // Re-reading the admin now reports hasActivated2FA false, which
            // sends the auth gate to enrolment. That is the intended landing,
            // not an error: there is no console to return to until it is on.
            await onChanged();
          }}
        />
      )}
    </DetailSection>
  );
}

function DisableTwoFactorForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!PIN.test(code.trim()) || !PIN.test(pin.trim())) {
      setError("Enter your 6-digit authenticator code and 6-digit PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await disableTotp({ code: code.trim(), pin: pin.trim() });
      await onDone();
    } catch (caught) {
      setError(toAppError(caught).userMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid max-w-sm gap-3" noValidate>
      <Alert tone="warning">
        <ShieldOffIcon aria-hidden />
        <AlertDescription className="text-foreground">
          Until you set it up again, you can&apos;t perform sensitive actions.
        </AlertDescription>
      </Alert>
      <div className="grid gap-1.5">
        <Label htmlFor="disable-code">Authenticator code</Label>
        <Input
          id="disable-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="disable-pin">Transaction PIN</Label>
        <Input
          id="disable-pin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy && <LoaderCircleIcon className="animate-spin" aria-hidden />}
          Disable
        </Button>
      </div>
    </form>
  );
}

function PinSection({
  pinIsSet,
  onChanged,
}: {
  pinIsSet: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if ((pinIsSet && !PIN.test(current)) || !PIN.test(next)) {
      setError("PINs are exactly 6 digits.");
      return;
    }
    if (next !== confirm) {
      setError("The new PINs do not match.");
      return;
    }
    if (/^(\d)\1{5}$/.test(next) || next === "123456" || next === "654321") {
      setError("Choose a PIN that is not a repeated or sequential number.");
      return;
    }
    setBusy(true);
    try {
      if (pinIsSet)
        await changeTransactionPin({ currentPin: current, newPin: next, confirmPin: confirm });
      else await setTransactionPin({ pin: next, confirmPin: confirm });
      toast.success(pinIsSet ? "Transaction PIN changed" : "Transaction PIN set");
      setCurrent("");
      setNext("");
      setConfirm("");
      await onChanged();
    } catch (caught) {
      setError(toAppError(caught).userMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailSection
      title="Transaction PIN"
      description="A 6-digit PIN required to move company funds. Five wrong attempts lock it for 15 minutes."
      actions={
        <Badge tone={pinIsSet ? "success" : "warning"}>{pinIsSet ? "Set" : "Not set"}</Badge>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="grid max-w-sm gap-3" noValidate>
        {pinIsSet && (
          <div className="grid gap-1.5">
            <Label htmlFor="pin-current">Current PIN</Label>
            <Input
              id="pin-current"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
              }}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pin-new">{pinIsSet ? "New PIN" : "PIN"}</Label>
            <Input
              id="pin-new"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pin-confirm">Confirm</Label>
            <Input
              id="pin-confirm"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
              }}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-fit" disabled={busy}>
          {busy ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden />
          ) : (
            <KeyRoundIcon aria-hidden />
          )}
          {pinIsSet ? "Change PIN" : "Set PIN"}
        </Button>
      </form>
    </DetailSection>
  );
}
