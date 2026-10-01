"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MinusCircleIcon, PlusCircleIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { Amount } from "@/components/format/amount";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { creditUserWallet, debitUserWallet, type UserDetail, type WalletAdjustment } from "./api";
import { userDisplayName } from "./queries";

export type AdjustmentDirection = "credit" | "debit";

/** The API rejects anything at or above this: `transactionAmount` is decimal(10,2). */
const MAX_AMOUNT = 100_000_000;

/** Enough that "correction" or "error" alone will not do. */
const MIN_NARRATION = 10;

const COPY: Record<
  AdjustmentDirection,
  { title: string; verb: string; submit: string; tone: "default" | "danger" }
> = {
  credit: {
    title: "Credit this wallet",
    verb: "credit",
    submit: "Credit wallet",
    tone: "default",
  },
  debit: {
    title: "Debit this wallet",
    verb: "debit",
    submit: "Debit wallet",
    tone: "danger",
  },
};

/**
 * Move naira into or out of one customer's wallet by hand.
 *
 * Both directions use one dialog on purpose. They need the same four
 * credentials, the same narration, and the same decision about what the customer
 * is shown, and two near-identical dialogs would inevitably drift apart on the
 * part that matters — whether the person doing it understands that no settlement
 * sits behind either.
 */
export function WalletAdjustmentDialog({
  user,
  direction,
  open,
  onOpenChange,
}: {
  user: UserDetail;
  direction: AdjustmentDirection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const copy = COPY[direction];

  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [recordTransaction, setRecordTransaction] = useState(true);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [twoFACode, setTwoFACode] = useState("");

  const parsed = Number(amount);
  const balance = Number(user.walletBalance ?? 0);
  const overdrawn = direction === "debit" && Number.isFinite(parsed) && parsed > balance;

  const mutation = useMutation({
    mutationFn: () => {
      const input: WalletAdjustment = {
        amount,
        narration,
        recordTransaction,
        notifyCustomer,
        password,
        pin,
        twoFACode,
      };
      return direction === "credit"
        ? creditUserWallet(user.id, input)
        : debitUserWallet(user.id, input);
    },
    onSuccess: (result) => {
      toast.success(result.message || `Wallet ${copy.verb}ed`);
      // Credentials are cleared whatever happens next: a password and PIN left
      // in component state after a dialog closes is a secret kept for no reason.
      setAmount("");
      setNarration("");
      setPassword("");
      setPin("");
      setTwoFACode("");
      void queryClient.invalidateQueries({ queryKey: ["user", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["user-wallet-ledger", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });

  function validate(): string | null {
    if (!Number.isFinite(parsed) || parsed <= 0) return "Enter an amount greater than zero.";
    if (parsed >= MAX_AMOUNT) {
      return "The most a single adjustment can record is ₦99,999,999.99.";
    }
    // Two decimal places, because that is what the column stores — sending more
    // would be silently rounded, and a rounded manual adjustment is the kind of
    // discrepancy that takes a day to find.
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      return "Use at most two decimal places.";
    }
    if (overdrawn) {
      return "That is more than the customer holds. The API will refuse it.";
    }
    if (narration.trim().length < MIN_NARRATION) {
      return `Write at least ${MIN_NARRATION} characters explaining why.`;
    }
    if (!password) return "Enter your account password.";
    if (!/^\d{6}$/.test(pin.trim())) return "Enter your 6-digit transaction PIN.";
    if (!/^\d{6}$/.test(twoFACode.trim())) {
      return "Enter the 6-digit code from your authenticator app.";
    }
    return null;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassword("");
          setPin("");
          setTwoFACode("");
        }
        onOpenChange(next);
      }}
      title={copy.title}
      tone={copy.tone}
      description={
        <>
          {direction === "credit"
            ? "Creates spendable balance with no bank settlement behind it."
            : "Removes balance with no bank disbursement behind it."}{" "}
          Recorded in the wallet ledger and the audit log under your name, always.
        </>
      }
      submitLabel={copy.submit}
      validate={validate}
      onSubmit={() => mutation.mutateAsync()}
    >
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <p className="font-medium">{userDisplayName(user)}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Current balance <Amount value={user.walletBalance} currency="NGN" />
        </p>
      </div>

      <Field
        id="adjustment-amount"
        label="Amount (₦)"
        hint={overdrawn ? "More than the customer holds." : "Naira, to at most two decimal places."}
      >
        <Input
          id="adjustment-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          aria-invalid={overdrawn}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
        />
      </Field>

      <Field
        id="adjustment-narration"
        label="Why"
        hint="Goes into the wallet ledger, the audit log, and the customer's alert if you send one."
      >
        <Textarea
          id="adjustment-narration"
          rows={3}
          value={narration}
          placeholder={
            direction === "credit"
              ? "e.g. Goodwill refund for the failed airtime purchase on 12 Sept, ref FLP-...."
              : "e.g. Reversing the duplicate ₦5,000 credit issued twice on 12 Sept, ref FLP-...."
          }
          onChange={(event) => {
            setNarration(event.target.value);
          }}
        />
      </Field>

      {/*
        The two customer-facing choices, grouped and explained together. Both
        default to on, so the ordinary case needs no decision — which is the
        right default, because an adjustment the customer cannot see is the
        exception and should feel like one.
      */}
      <fieldset className="grid gap-3 rounded-md border px-3 pt-2 pb-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          What the customer sees
        </legend>

        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="grid gap-0.5">
            <span className="font-medium">Add a transaction record</span>
            <span className="text-xs text-muted-foreground">
              Shows in the customer&apos;s own transaction history as a{" "}
              {direction === "credit" ? "deposit" : "withdrawal"}. Turn off for an internal
              correction they should not be invited to interpret.
            </span>
          </span>
          <Switch
            checked={recordTransaction}
            onCheckedChange={(next) => {
              setRecordTransaction(next);
              // An alert pointing at a transaction that was never written sends
              // the customer looking for a payment they will not find, so the
              // alert follows the record down. Turning the record back on does
              // not silently re-enable the alert: that is a separate decision.
              if (!next) setNotifyCustomer(false);
            }}
            aria-label="Add a transaction record"
          />
        </div>

        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="grid gap-0.5">
            <span className="font-medium">Send a {direction} alert</span>
            <span className="text-xs text-muted-foreground">
              Push and in-app notification, immediately.
            </span>
          </span>
          <Switch
            checked={notifyCustomer}
            disabled={!recordTransaction}
            onCheckedChange={setNotifyCustomer}
            aria-label={`Send a ${direction} alert`}
          />
        </div>

        {!recordTransaction && (
          <p className="text-xs text-warning">
            Silent adjustment. The balance still changes, and the wallet ledger and audit log still
            name you — only the customer&apos;s own history stays unchanged.
          </p>
        )}
      </fieldset>

      {/*
        Four credentials, asked for here rather than left to a 401. The API
        requires all of them on every call, so collecting them up front turns
        what would be three consecutive rejections into one form.
      */}
      <fieldset className="grid gap-3 rounded-md border px-3 pt-2 pb-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Confirm it is you
        </legend>
        <Field id="adjustment-password" label="Account password">
          <Input
            id="adjustment-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>
        <Field id="adjustment-pin" label="Transaction PIN">
          <Input
            id="adjustment-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            className="max-w-40 font-mono tracking-widest"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value);
            }}
          />
        </Field>
        <Field id="adjustment-2fa" label="Authenticator code">
          <Input
            id="adjustment-2fa"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="max-w-40 font-mono tracking-widest"
            value={twoFACode}
            onChange={(event) => {
              setTwoFACode(event.target.value);
            }}
          />
        </Field>
      </fieldset>

      {direction === "credit" && (
        <Alert tone="warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>This is real, spendable money</AlertTitle>
          <AlertDescription>
            The customer can withdraw it immediately. Nothing settles it from a bank, so the company
            carries the cost.
          </AlertDescription>
        </Alert>
      )}
    </FormDialog>
  );
}

export const ADJUSTMENT_ICON = {
  credit: PlusCircleIcon,
  debit: MinusCircleIcon,
} as const;
