"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CoinsIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  SearchIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { Amount } from "@/components/format/amount";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  creditUserCryptoWallet,
  creditUserWallet,
  debitUserCryptoWallet,
  debitUserWallet,
  fetchUser,
  fetchUserWallets,
  searchUsers,
  type UserDetail,
  type UserWallet,
  type WalletAdjustment,
} from "./api";
import { userDisplayName } from "./queries";

export type AdjustmentDirection = "credit" | "debit";
export type AdjustmentAssetType = "fiat" | "crypto";

/** The API rejects anything at or above this for NGN: `transactionAmount` is decimal(10,2). */
const MAX_FIAT_AMOUNT = 100_000_000;

/** Enough that "correction" or "error" alone will not do. */
const MIN_NARRATION = 10;

const SUPPORTED_CRYPTO_ASSETS: Array<{ ticker: string; name: string }> = [
  { ticker: "USDT", name: "Tether" },
  { ticker: "BTC", name: "Bitcoin" },
  { ticker: "ETH", name: "Ethereum" },
  { ticker: "SOL", name: "Solana" },
  { ticker: "USDC", name: "USD Coin" },
  { ticker: "BNB", name: "BNB" },
  { ticker: "TRX", name: "TRON" },
];

const COPY: Record<
  AdjustmentDirection,
  {
    fiatTitle: string;
    cryptoTitle: string;
    verb: string;
    fiatSubmit: string;
    cryptoSubmit: string;
    tone: "default" | "danger";
  }
> = {
  credit: {
    fiatTitle: "Credit fiat wallet (NGN)",
    cryptoTitle: "Credit crypto wallet",
    verb: "credit",
    fiatSubmit: "Credit fiat wallet",
    cryptoSubmit: "Credit crypto wallet",
    tone: "default",
  },
  debit: {
    fiatTitle: "Debit fiat wallet (NGN)",
    cryptoTitle: "Debit crypto wallet",
    verb: "debit",
    fiatSubmit: "Debit fiat wallet",
    cryptoSubmit: "Debit crypto wallet",
    tone: "danger",
  },
};

export interface WalletAdjustmentDialogProps {
  user: UserDetail;
  direction: AdjustmentDirection;
  initialAssetType?: AdjustmentAssetType;
  initialCoinTicker?: string;
  wallets?: UserWallet[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WalletAdjustmentDialog({
  user,
  direction,
  initialAssetType = "fiat",
  initialCoinTicker,
  wallets: initialWallets,
  open,
  onOpenChange,
}: WalletAdjustmentDialogProps) {
  const queryClient = useQueryClient();
  const copy = COPY[direction];

  const [targetUserId, setTargetUserId] = useState(user.id);
  const [changingUser, setChangingUser] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");

  const [assetType, setAssetType] = useState<AdjustmentAssetType>(initialAssetType);
  const [fiatWalletKey, setFiatWalletKey] = useState("NGN_MAIN");
  const [coinTicker, setCoinTicker] = useState(initialCoinTicker ?? "USDT");

  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [recordTransaction, setRecordTransaction] = useState(true);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [twoFACode, setTwoFACode] = useState("");

  // Search other users when the admin wants to switch the target user account
  const userSearchQuery = useQuery({
    queryKey: ["users", "adjustment-picker", userSearchTerm],
    queryFn: ({ signal }) =>
      searchUsers(
        {
          page: 1,
          pageSize: 8,
          search: userSearchTerm.trim() || undefined,
        },
        signal,
      ),
    enabled: open && changingUser,
  });

  // Load selected user's full detail if different from the page user
  const targetUserQuery = useQuery({
    queryKey: ["user", targetUserId],
    queryFn: ({ signal }) => fetchUser(targetUserId, signal),
    enabled: open && targetUserId !== user.id,
  });

  const activeUser: UserDetail = targetUserId === user.id ? user : (targetUserQuery.data ?? user);

  // Load crypto wallets for the selected user
  const targetWalletsQuery = useQuery({
    queryKey: ["user-wallets", activeUser.id],
    queryFn: ({ signal }) => fetchUserWallets(activeUser.id, signal),
    enabled: open && (activeUser.id !== user.id || !initialWallets),
  });

  const activeCryptoWallets: UserWallet[] = useMemo(() => {
    if (activeUser.id === user.id && initialWallets) {
      return targetWalletsQuery.data ?? initialWallets;
    }
    return targetWalletsQuery.data ?? [];
  }, [activeUser.id, user.id, initialWallets, targetWalletsQuery.data]);

  // Combine user's existing crypto wallets with supported tickers
  const cryptoOptions = useMemo(() => {
    const byTicker = new Map<
      string,
      {
        ticker: string;
        name: string;
        cryptoBalance: string;
        nairaBalance: string | null;
        networkLabel: string | null;
        address: string | null;
        hasWallet: boolean;
      }
    >();

    for (const w of activeCryptoWallets) {
      const ticker = w.coinTicker.toUpperCase();
      const firstNet = w.networks.find((n) => n.address);
      byTicker.set(ticker, {
        ticker,
        name: w.coinName,
        cryptoBalance: w.coinBalance.cryptoBalance,
        nairaBalance: w.coinBalance.nairaBalance,
        networkLabel: firstNet?.network ?? null,
        address: firstNet?.address ?? null,
        hasWallet: true,
      });
    }

    for (const c of activeUser.coinBalances) {
      const ticker = c.ticker.toUpperCase();
      if (!byTicker.has(ticker)) {
        byTicker.set(ticker, {
          ticker,
          name: c.name,
          cryptoBalance: c.cryptoBalance,
          nairaBalance: c.nairaBalance,
          networkLabel: null,
          address: null,
          hasWallet: true,
        });
      }
    }

    for (const preset of SUPPORTED_CRYPTO_ASSETS) {
      if (!byTicker.has(preset.ticker)) {
        byTicker.set(preset.ticker, {
          ticker: preset.ticker,
          name: preset.name,
          cryptoBalance: "0",
          nairaBalance: "0.00",
          networkLabel: null,
          address: null,
          hasWallet: false,
        });
      }
    }

    return Array.from(byTicker.values());
  }, [activeCryptoWallets, activeUser.coinBalances]);

  const selectedCrypto = useMemo(
    () =>
      cryptoOptions.find((o) => o.ticker === coinTicker.toUpperCase()) ??
      cryptoOptions[0] ?? {
        ticker: "USDT",
        name: "Tether",
        cryptoBalance: "0",
        nairaBalance: "0.00",
        networkLabel: null,
        address: null,
        hasWallet: false,
      },
    [cryptoOptions, coinTicker],
  );

  const parsed = Number(amount);
  const fiatBalance = Number(activeUser.walletBalance ?? 0);
  const cryptoBalance = Number(selectedCrypto.cryptoBalance || 0);

  const overdrawn =
    direction === "debit" &&
    Number.isFinite(parsed) &&
    parsed > (assetType === "fiat" ? fiatBalance : cryptoBalance);

  const mutation = useMutation({
    mutationFn: async () => {
      const baseInput: WalletAdjustment = {
        amount: amount.trim(),
        narration,
        recordTransaction,
        notifyCustomer,
        password,
        pin,
        twoFACode,
      };
      if (assetType === "fiat") {
        return direction === "credit"
          ? creditUserWallet(activeUser.id, baseInput)
          : debitUserWallet(activeUser.id, baseInput);
      }
      return direction === "credit"
        ? creditUserCryptoWallet(activeUser.id, {
            ...baseInput,
            coinTicker: selectedCrypto.ticker,
          })
        : debitUserCryptoWallet(activeUser.id, {
            ...baseInput,
            coinTicker: selectedCrypto.ticker,
          });
    },
    onSuccess: (result) => {
      toast.success(result.message || `Wallet ${copy.verb}ed`);
      setAmount("");
      setNarration("");
      setPassword("");
      setPin("");
      setTwoFACode("");
      void queryClient.invalidateQueries({ queryKey: ["user", activeUser.id] });
      void queryClient.invalidateQueries({ queryKey: ["user", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["user-wallet-ledger", activeUser.id] });
      void queryClient.invalidateQueries({ queryKey: ["user-wallets", activeUser.id] });
      void queryClient.invalidateQueries({ queryKey: ["user-wallets", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });

  function validate(): string | null {
    if (!Number.isFinite(parsed) || parsed <= 0) return "Enter an amount greater than zero.";
    if (assetType === "fiat") {
      if (parsed >= MAX_FIAT_AMOUNT) {
        return "The most a single fiat adjustment can record is ₦99,999,999.99.";
      }
      if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
        return "Use at most two decimal places for Naira.";
      }
    } else {
      if (!/^\d+(\.\d{1,8})?$/.test(amount.trim())) {
        return "Use at most 8 decimal places for crypto amounts.";
      }
    }
    if (overdrawn) {
      return assetType === "fiat"
        ? "That is more Naira than the customer holds. The API will refuse it."
        : `That is more ${selectedCrypto.ticker} than the customer holds (${selectedCrypto.cryptoBalance} ${selectedCrypto.ticker}).`;
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

  const dialogTitle = assetType === "fiat" ? copy.fiatTitle : copy.cryptoTitle;
  const submitLabel =
    assetType === "fiat"
      ? copy.fiatSubmit
      : `${direction === "credit" ? "Credit" : "Debit"} ${selectedCrypto.ticker} wallet`;

  const primaryBank = activeUser.bankDetails[0];

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
      title={dialogTitle}
      tone={copy.tone}
      description={
        <>
          {direction === "credit"
            ? assetType === "fiat"
              ? "Creates spendable Naira balance with no bank settlement behind it."
              : `Credits ${selectedCrypto.ticker} directly to the customer's crypto wallet.`
            : assetType === "fiat"
              ? "Removes Naira balance with no bank disbursement behind it."
              : `Debits ${selectedCrypto.ticker} directly from the customer's crypto wallet.`}{" "}
          Recorded in the ledger and the audit log under your name, always.
        </>
      }
      submitLabel={submitLabel}
      validate={validate}
      onSubmit={() => mutation.mutateAsync()}
    >
      {/* 1. User Account Selector */}
      <div className="grid gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="grid">
            <span className="text-xs font-medium text-muted-foreground">Selected user account</span>
            <p className="font-medium">{userDisplayName(activeUser)}</p>
            <p className="text-xs text-muted-foreground">
              {activeUser.email}
              {activeUser.userName ? ` · @${activeUser.userName}` : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setChangingUser((prev) => !prev);
            }}
          >
            <UserCheckIcon aria-hidden />
            {changingUser ? "Close picker" : "Change user"}
          </Button>
        </div>

        {changingUser && (
          <div className="grid gap-2 border-t pt-2">
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
              />
              <Input
                value={userSearchTerm}
                onChange={(e) => {
                  setUserSearchTerm(e.target.value);
                }}
                placeholder="Search user by name, email, or @username…"
                className="pl-8"
              />
            </div>
            <div className="max-h-40 divide-y overflow-y-auto rounded-md border bg-card">
              {userSearchQuery.isPending && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Searching accounts…</p>
              )}
              {userSearchQuery.data?.rows.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    setTargetUserId(candidate.id);
                    setChangingUser(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <span className="grid">
                    <span className="font-medium text-foreground">
                      {userDisplayName(candidate)}
                    </span>
                    <span className="text-muted-foreground">
                      {candidate.email}
                      {candidate.userName ? ` · @${candidate.userName}` : ""}
                    </span>
                  </span>
                  <span className="text-right text-muted-foreground">
                    <Amount value={candidate.walletBalance} currency="NGN" />
                  </span>
                </button>
              ))}
              {userSearchQuery.isSuccess && userSearchQuery.data.rows.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No matching user accounts found.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Operation Type (Fiat vs Crypto) & Specific Wallet Selector */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="adjustment-asset-type" label="Wallet type">
          <Select
            value={assetType}
            onValueChange={(value) => {
              setAssetType(value as AdjustmentAssetType);
              setAmount("");
            }}
          >
            <SelectTrigger id="adjustment-asset-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fiat">
                <span className="flex items-center gap-2">
                  <WalletIcon className="size-3.5" aria-hidden />
                  {direction === "credit" ? "Credit Fiat (NGN)" : "Debit Fiat (NGN)"}
                </span>
              </SelectItem>
              <SelectItem value="crypto">
                <span className="flex items-center gap-2">
                  <CoinsIcon className="size-3.5" aria-hidden />
                  {direction === "credit" ? "Credit Crypto Wallet" : "Debit Crypto Wallet"}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {assetType === "fiat" ? (
          <Field id="adjustment-fiat-wallet" label="Select fiat account / wallet">
            <Select value={fiatWalletKey} onValueChange={setFiatWalletKey}>
              <SelectTrigger id="adjustment-fiat-wallet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NGN_MAIN">
                  Main Naira Wallet (₦
                  {Number(activeUser.walletBalance ?? 0).toLocaleString("en-NG", {
                    minimumFractionDigits: 2,
                  })}
                  )
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field id="adjustment-crypto-wallet" label="Select crypto wallet">
            <Select
              value={selectedCrypto.ticker}
              onValueChange={(val) => {
                setCoinTicker(val);
              }}
            >
              <SelectTrigger id="adjustment-crypto-wallet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cryptoOptions.map((opt) => (
                  <SelectItem key={opt.ticker} value={opt.ticker}>
                    {opt.ticker} ({opt.name}) — {opt.cryptoBalance} {opt.ticker}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {/* 3. Active Wallet Balance & Account Info Card */}
      <div className="rounded-md border bg-card px-3 py-2 text-xs">
        {assetType === "fiat" ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">
              Available Fiat Balance:{" "}
              <Amount
                value={activeUser.walletBalance}
                currency="NGN"
                className="font-semibold text-foreground"
              />
            </span>
            {primaryBank && (
              <span className="text-muted-foreground">
                Virtual Account: <strong className="text-foreground">{primaryBank.bankName}</strong>{" "}
                · <span className="font-mono text-foreground">{primaryBank.accountNumber}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">
                Available {selectedCrypto.ticker} Balance:{" "}
                <Amount
                  value={selectedCrypto.cryptoBalance}
                  currency={selectedCrypto.ticker}
                  className="font-semibold text-foreground"
                />
              </span>
              {selectedCrypto.nairaBalance && (
                <span className="text-muted-foreground">
                  Est. Value:{" "}
                  <Amount
                    value={selectedCrypto.nairaBalance}
                    currency="NGN"
                    className="font-medium text-foreground"
                  />
                </span>
              )}
            </div>
            {selectedCrypto.address && (
              <p className="truncate text-muted-foreground">
                Wallet Address ({selectedCrypto.networkLabel ?? "mainnet"}):{" "}
                <span className="font-mono text-foreground">{selectedCrypto.address}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <Field
        id="adjustment-amount"
        label={assetType === "fiat" ? "Amount (₦)" : `Amount (${selectedCrypto.ticker})`}
        hint={
          overdrawn
            ? `More than the customer holds in their ${assetType === "fiat" ? "Naira" : selectedCrypto.ticker} wallet.`
            : assetType === "fiat"
              ? "Naira, to at most two decimal places."
              : `${selectedCrypto.ticker} amount, up to 8 decimal places.`
        }
      >
        <Input
          id="adjustment-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder={assetType === "fiat" ? "0.00" : "0.000000"}
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
              ? assetType === "fiat"
                ? "e.g. Goodwill refund for the failed airtime purchase on 12 Sept, ref FLP-...."
                : `e.g. Manual ${selectedCrypto.ticker} deposit reconciliation for tx hash 0x...`
              : assetType === "fiat"
                ? "e.g. Reversing the duplicate ₦5,000 credit issued twice on 12 Sept, ref FLP-...."
                : `e.g. Reversing duplicate ${selectedCrypto.ticker} credit on user wallet, ref FLP-...`
          }
          onChange={(event) => {
            setNarration(event.target.value);
          }}
        />
      </Field>

      <fieldset className="grid gap-3 rounded-md border px-3 pt-2 pb-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          What the customer sees
        </legend>

        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="grid gap-0.5">
            <span className="font-medium">Add a transaction record</span>
            <span className="text-xs text-muted-foreground">
              Shows in the customer&apos;s own transaction history as a{" "}
              {direction === "credit" ? "credit" : "debit"}. Turn off for an internal correction
              they should not be invited to interpret.
            </span>
          </span>
          <Switch
            checked={recordTransaction}
            onCheckedChange={(next) => {
              setRecordTransaction(next);
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
          <AlertTitle>This is real, spendable balance</AlertTitle>
          <AlertDescription>
            The customer can withdraw or sell it immediately. Nothing settles it externally, so the
            company carries the cost.
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
