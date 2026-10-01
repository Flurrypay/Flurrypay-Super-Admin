"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, LoaderCircleIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { Amount } from "@/components/format/amount";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  type CryptoReserve,
  fetchWithdrawalLimit,
  type ResolvedRecipient,
  resolveWithdrawalRecipient,
  withdrawFromReserve,
} from "./api";

/** Wait this long after the last keystroke before asking the API who this is. */
const RESOLVE_DEBOUNCE_MS = 450;

/**
 * Move crypto out of a company reserve.
 *
 * THE SHAPE OF THIS FORM IS THE POINT
 *
 * The destination is resolved before anything is sent, and what comes back
 * decides what the admin is warned about: a Flurrypay username is an internal
 * book transfer that costs nothing and can be undone by sending it back; an
 * external address is an on-chain transfer that costs a real fee and cannot be
 * undone by anyone. Those are different acts, and a form that treats them the
 * same is how the second one happens by accident.
 *
 * The daily ceiling is shown before the amount field rather than after the
 * submit, because being refused with a full form is the worst moment to learn
 * a number that was knowable at the start.
 */
export function WithdrawDialog({
  reserves,
  initialTicker,
  open,
  onOpenChange,
}: {
  reserves: CryptoReserve[];
  initialTicker?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [ticker, setTicker] = useState(initialTicker ?? reserves[0]?.coinTicker ?? "");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  /**
   * The chosen network, remembered alongside the coin it was chosen for.
   *
   * Stored as a pair rather than reset by an effect: a TRC20 choice must not
   * survive into a coin that has no TRC20 chain, and deriving that from the
   * pair makes it impossible for a render to happen in between where it has.
   */
  const [networkChoice, setNetworkChoice] = useState<{ ticker: string; id: string }>({
    ticker: "",
    id: "",
  });
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [twoFACode, setTwoFACode] = useState("");

  const reserve = reserves.find((r) => r.coinTicker === ticker) ?? null;
  const networks = reserve?.networks.filter((n) => n.withdrawsEnabled) ?? [];
  const held = Number(reserve?.coinBalance.cryptoBalance ?? 0);
  const parsed = Number(amount);
  const networkId = networkChoice.ticker === ticker ? networkChoice.id : "";
  const setNetworkId = (id: string) => {
    setNetworkChoice({ ticker, id });
  };

  const limit = useQuery({
    queryKey: ["treasury", "withdrawal-limit"],
    queryFn: ({ signal }) => fetchWithdrawalLimit(signal),
    enabled: open,
  });

  const resolved = useResolvedRecipient({ destination, ticker, networkId, enabled: open });

  const mutation = useMutation({
    mutationFn: () =>
      withdrawFromReserve({
        currency: ticker.toLowerCase(),
        amount,
        // Exactly one of these: the API branches on which is present, and
        // sending both would let it pick.
        address: resolved.data?.kind === "external" ? destination.trim() : null,
        userName: resolved.data?.kind === "internal" ? destination.trim() : null,
        network: networkId || networks[0]?.networkId || null,
        password,
        pin,
        twoFACode,
      }),
    onSuccess: () => {
      toast.success(`${amount} ${ticker} sent`);
      setAmount("");
      setDestination("");
      setPassword("");
      setPin("");
      setTwoFACode("");
      void queryClient.invalidateQueries({ queryKey: ["treasury"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });

  function validate(): string | null {
    if (!ticker) return "Choose which reserve to withdraw from.";
    if (!Number.isFinite(parsed) || parsed <= 0) return "Enter an amount greater than zero.";
    if (reserve && !reserve.balanceUnavailable && parsed > held) {
      return `The ${ticker} reserve holds ${held}. Withdrawing more would fail at the exchange.`;
    }
    if (!destination.trim()) return "Enter a destination address or Flurrypay username.";
    if (resolved.isFetching) return "Still checking the destination — give it a moment.";
    if (!resolved.data?.ok) {
      return (
        resolved.data?.message ?? "That destination could not be verified. Check it before sending."
      );
    }
    if (resolved.data.kind === "external" && networks.length > 1 && !networkId) {
      return "Choose the network to send on. The wrong chain loses the funds.";
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
      title="Withdraw from reserves"
      tone="danger"
      description="Moves crypto out of a company wallet. Recorded in the audit log under your name, and counted against the rolling 24-hour ceiling."
      submitLabel="Withdraw"
      validate={validate}
      onSubmit={() => mutation.mutateAsync()}
    >
      {limit.data && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground">Remaining in your 24-hour ceiling</span>
            <Amount value={limit.data.remaining} currency="NGN" className="font-semibold" />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Amount value={limit.data.used} currency="NGN" className="font-normal" /> of{" "}
            <Amount value={limit.data.limit} currency="NGN" className="font-normal" /> used.
            Rolling, shared across crypto sends and fiat withdrawals.
          </p>
        </div>
      )}

      <Field
        id="withdraw-currency"
        label="From reserve"
        hint={
          reserve
            ? reserve.balanceUnavailable
              ? "Balance unavailable — the exchange did not answer. The send may still fail for lack of funds."
              : `Holding ${reserve.coinBalance.cryptoBalance} ${reserve.coinTicker}.`
            : undefined
        }
      >
        <Select value={ticker} onValueChange={setTicker}>
          <SelectTrigger id="withdraw-currency">
            <SelectValue placeholder="Choose a reserve" />
          </SelectTrigger>
          <SelectContent>
            {reserves.map((r) => (
              <SelectItem key={r.coinTicker} value={r.coinTicker}>
                {r.coinTicker} — {r.coinBalance.cryptoBalance}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="withdraw-amount" label={`Amount (${ticker || "crypto"})`}>
        <Input
          id="withdraw-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
        />
      </Field>

      <Field
        id="withdraw-destination"
        label="Send to"
        hint="A Flurrypay username or email stays internal. Anything else is treated as an external address and leaves the network."
      >
        <Input
          id="withdraw-destination"
          autoComplete="off"
          spellCheck={false}
          placeholder="Username, email, or wallet address"
          value={destination}
          onChange={(event) => {
            setDestination(event.target.value);
          }}
        />
      </Field>

      <RecipientPreview state={resolved} />

      {resolved.data?.kind === "external" && networks.length > 1 && (
        <Field
          id="withdraw-network"
          label="Network"
          hint="Sending on the wrong chain loses the funds permanently."
        >
          <Select value={networkId} onValueChange={setNetworkId}>
            <SelectTrigger id="withdraw-network">
              <SelectValue placeholder="Choose a network" />
            </SelectTrigger>
            <SelectContent>
              {networks.map((network) => (
                <SelectItem key={network.id} value={network.networkId ?? network.id}>
                  {network.network ?? network.networkId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <fieldset className="grid gap-3 rounded-md border px-3 pt-2 pb-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Confirm it is you
        </legend>
        <Field id="withdraw-password" label="Account password">
          <Input
            id="withdraw-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>
        <Field id="withdraw-pin" label="Transaction PIN">
          <Input
            id="withdraw-pin"
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
        <Field id="withdraw-2fa" label="Authenticator code">
          <Input
            id="withdraw-2fa"
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
    </FormDialog>
  );
}

type ResolveState = {
  data: ResolvedRecipient | null;
  isFetching: boolean;
  error: unknown;
};

/**
 * Ask the API who a destination belongs to, once typing settles.
 *
 * Debounced because it is a per-keystroke lookup against an exchange, and
 * cancelled on change so a slow answer for an old value cannot land after a
 * fast answer for the current one.
 */
function useResolvedRecipient({
  destination,
  ticker,
  networkId,
  enabled,
}: {
  destination: string;
  ticker: string;
  networkId: string;
  enabled: boolean;
}): ResolveState {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(destination.trim());
    }, RESOLVE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [destination]);

  const query = useQuery({
    queryKey: ["treasury", "resolve-recipient", ticker, debounced, networkId],
    queryFn: ({ signal }) =>
      resolveWithdrawalRecipient(
        { identifier: debounced, currency: ticker.toLowerCase(), network: networkId || null },
        signal,
      ),
    enabled: enabled && debounced.length > 0 && ticker.length > 0,
    staleTime: 30_000,
  });

  return {
    // While the typed value is ahead of the resolved one, report nothing rather
    // than the previous destination's verdict — which would be a confident
    // answer about an address the admin is no longer sending to.
    data: debounced === destination.trim() ? (query.data ?? null) : null,
    isFetching: query.isFetching || debounced !== destination.trim(),
    error: query.error,
  };
}

function RecipientPreview({ state }: { state: ResolveState }) {
  if (state.isFetching) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
        Checking the destination…
      </p>
    );
  }

  const data = state.data;
  if (!data) return null;

  if (!data.ok) {
    return (
      <Alert tone="warning">
        <TriangleAlertIcon aria-hidden />
        <AlertTitle>This destination could not be used</AlertTitle>
        <AlertDescription>
          {data.message ?? "Check the address or username and try again."}
        </AlertDescription>
      </Alert>
    );
  }

  if (data.kind === "internal") {
    return (
      <Alert tone="info">
        <UsersIcon aria-hidden />
        <AlertTitle>
          Internal transfer to {data.recipientName ?? data.recipientUserName ?? "a customer"}
        </AlertTitle>
        <AlertDescription>
          {data.note ?? "Flurrypay to Flurrypay — no network fee."} The customer is credited and
          notified immediately.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert tone="danger">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>External address — this leaves the network for good</AlertTitle>
      <AlertDescription className="grid gap-1">
        <span>{data.note ?? "On-chain transfers cannot be reversed by anyone."}</span>
        <span>
          {data.feeEstimate ? (
            <>
              Network fee about {data.feeEstimate.fee} {data.feeEstimate.currency}.
            </>
          ) : (
            // Never render an unfetched quote as "free" — that is the reading
            // that makes an expensive mistake look cheap.
            <>Network fee could not be quoted right now. It will still be charged.</>
          )}
        </span>
      </AlertDescription>
    </Alert>
  );
}

/** Shown on the reserves table when a send has just gone through. */
export function WithdrawSuccess({ children }: { children: React.ReactNode }) {
  return (
    <Alert tone="info">
      <CheckCircle2Icon aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
