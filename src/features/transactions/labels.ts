import {
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  LoaderCircleIcon,
  Undo2Icon,
} from "lucide-react";

import type { StatusMap } from "@/components/status/status-badge";

import type { TransactionStatus, TransactionType } from "./api";

export const TRANSACTION_STATUS: StatusMap<TransactionStatus> = {
  PENDING: {
    label: "Pending",
    tone: "neutral",
    icon: ClockIcon,
    description: "Created and awaiting processing.",
  },
  PROCESSING: {
    label: "Processing",
    tone: "info",
    icon: LoaderCircleIcon,
    description: "Submitted to a provider; the outcome is not yet known.",
  },
  COMPLETED: {
    label: "Completed",
    tone: "success",
    icon: CircleCheckIcon,
    description: "Settled successfully.",
  },
  FAILED: {
    label: "Failed",
    tone: "danger",
    icon: CircleXIcon,
    description: "Did not complete. Check whether funds were returned (reversal).",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "neutral",
    icon: BanIcon,
    description: "Stopped before processing.",
  },
  REVERSED: {
    label: "Reversed",
    tone: "warning",
    icon: Undo2Icon,
    description: "Funds were returned to the customer.",
  },
};

export type Direction = "in" | "out" | "exchange";

export const TRANSACTION_TYPE: Record<TransactionType, { label: string; direction: Direction }> = {
  CRYPTO_BUY: { label: "Crypto buy", direction: "exchange" },
  CRYPTO_SELL: { label: "Crypto sell", direction: "exchange" },
  CRYPTO_SWAP: { label: "Crypto swap", direction: "exchange" },
  CRYPTO_SEND: { label: "Crypto send", direction: "out" },
  CRYPTO_RECEIVE: { label: "Crypto receive", direction: "in" },
  FIAT_DEPOSIT: { label: "Naira deposit", direction: "in" },
  FIAT_WITHDRAWAL: { label: "Naira withdrawal", direction: "out" },
  WALLET_FUNDING: { label: "Wallet funding", direction: "in" },
  WALLET_WITHDRAWAL: { label: "Wallet withdrawal", direction: "out" },
  AIRTIME_PURCHASE: { label: "Airtime", direction: "out" },
  DATA_PURCHASE: { label: "Data bundle", direction: "out" },
  ELECTRICITY_BILL: { label: "Electricity", direction: "out" },
  CABLE_SUBSCRIPTION: { label: "Cable TV", direction: "out" },
};

export function transactionTypeLabel(type: string): string {
  return type in TRANSACTION_TYPE ? TRANSACTION_TYPE[type as TransactionType].label : type;
}

export function transactionDirection(type: string): Direction | null {
  return type in TRANSACTION_TYPE ? TRANSACTION_TYPE[type as TransactionType].direction : null;
}
