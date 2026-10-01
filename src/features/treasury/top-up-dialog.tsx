"use client";

import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Identifier } from "@/components/format/identifier";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import type { CryptoReserve, PayoutProvider } from "./api";

/**
 * How to put money into the treasury.
 *
 * WHY THIS IS INSTRUCTIONS AND NOT A BUTTON
 *
 * There is no endpoint that moves money into a company account, and there
 * could not sensibly be one: funding the naira float means a real bank
 * transfer into the settlement account, and funding a crypto reserve means an
 * on-chain deposit to its address. The API's part is telling you *where*, which
 * it does — the payout provider record carries the bank details, and the wallet
 * record carries a deposit address per network.
 *
 * So this dialog shows the destination and nothing else. A "Top up" button that
 * appeared to move money and did not would be worse than no button at all.
 */
export function TopUpDialog({
  target,
  open,
  onOpenChange,
}: {
  target: { kind: "fiat"; provider: PayoutProvider } | { kind: "crypto"; reserve: CryptoReserve };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {target.kind === "fiat"
                ? "Fund the settlement account"
                : `Fund the ${target.reserve.coinTicker} reserve`}
            </DialogTitle>
            <DialogDescription>
              {target.kind === "fiat"
                ? "Transfer into this account from the company's bank. The balance here updates once the provider reports it — use Sync if it has not appeared."
                : "Send to this address from the company's exchange or custody account. The balance updates once the network confirms the deposit."}
            </DialogDescription>
          </DialogHeader>

          {target.kind === "fiat" ? (
            <FiatInstructions provider={target.provider} />
          ) : (
            <CryptoInstructions reserve={target.reserve} />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function FiatInstructions({ provider }: { provider: PayoutProvider }) {
  const hasAccount = Boolean(provider.accountNumber);

  return (
    <div className="grid gap-3">
      {!hasAccount && (
        <Alert tone="warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>No account number is recorded for this provider</AlertTitle>
          <AlertDescription>
            The provider record has no account number, so the console cannot tell you where to send
            funds. A super admin can add it under provider configuration, or the finance team will
            have it on file.
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
        <Row label="Account name" value={provider.accountName} />
        <Row
          label="Account number"
          value={
            provider.accountNumber ? (
              // Not masked. A masked account number cannot be transferred to,
              // and this is the company's own account, not a customer's.
              <Identifier value={provider.accountNumber} label="account number" />
            ) : null
          }
        />
        <Row label="Bank" value={provider.bankName} />
        <Row label="Provider" value={provider.name} />
      </dl>

      <Alert tone="info">
        <InfoIcon aria-hidden />
        <AlertDescription>
          A transfer here does not appear instantly: the provider has to report it, and this page
          shows a cached figure. Press <strong>Sync</strong> on the account once the transfer has
          left the sending bank.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function CryptoInstructions({ reserve }: { reserve: CryptoReserve }) {
  const networks = reserve.networks.filter((network) => network.address);
  const [selectedId, setSelectedId] = useState(() => networks[0]?.id ?? "");
  const selected = networks.find((network) => network.id === selectedId) ?? networks[0] ?? null;

  if (networks.length === 0) {
    return (
      <Alert tone="warning">
        <TriangleAlertIcon aria-hidden />
        <AlertTitle>No deposit address for this reserve</AlertTitle>
        <AlertDescription>
          The exchange has not returned an address for {reserve.coinTicker}. Press Sync on the
          reserves table; if it stays empty, the wallet has not been created upstream yet.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3">
      {/*
        The network choice comes before the address, deliberately. Sending on
        the wrong chain is the one mistake here that cannot be undone, and an
        address shown without the chain it belongs to invites exactly that.
      */}
      {networks.length > 1 && (
        <div className="grid gap-1.5">
          <label htmlFor="topup-network" className="text-sm font-medium">
            Network
          </label>
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger id="topup-network">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {networks.map((network) => (
                <SelectItem key={network.id} value={network.id}>
                  {network.network ?? network.networkId ?? "Default"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selected && (
        <>
          <Alert tone="danger">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>
              Send only {reserve.coinTicker} on{" "}
              {selected.network ?? selected.networkId ?? "this network"}
            </AlertTitle>
            <AlertDescription>
              Another asset, or the right asset on another chain, is lost permanently. Nobody can
              recover it — not us, not the exchange.
            </AlertDescription>
          </Alert>

          <div className="grid justify-items-center gap-2 rounded-md border bg-card px-3 py-4">
            <AddressQr key={selected.address} value={selected.address} />
            <Identifier
              value={selected.address}
              label={`${reserve.coinTicker} deposit address`}
              className="text-xs break-all"
            />
            <p className="text-xs text-muted-foreground">
              {selected.network ?? selected.networkId} · {reserve.coinName || reserve.coinTicker}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The address as a QR code, rendered in the browser.
 *
 * Generated locally rather than fetched, for the same reason the 2FA secret is:
 * nothing about where the company's money goes needs to travel to a third-party
 * image service to be drawn.
 *
 * Keyed on the address by its caller, so switching network remounts it with
 * empty state rather than briefly showing the previous chain's code under the
 * new chain's label — which is the one confusion this dialog must not create.
 */
function AddressQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: 176, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [value]);

  // The address text below is the real instruction; the QR is a convenience, so
  // a failure to draw it is not worth an error state.
  if (failed) return null;
  if (!src) return <Skeleton className="size-44" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a locally generated data: URI
    <img src={src} alt="" width={176} height={176} className="rounded-md bg-white p-2" />
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-baseline gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
