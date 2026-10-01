import {
  BanIcon,
  CircleCheckIcon,
  KeyRoundIcon,
  MailWarningIcon,
  PauseCircleIcon,
  SnowflakeIcon,
  UserXIcon,
} from "lucide-react";

import type { StatusMap } from "@/components/status/status-badge";

import type { UserListItem } from "./api";

export const ACCOUNT_STATES = [
  "active",
  "blocked",
  "suspended",
  "frozen",
  "locked",
  "unconfirmed",
] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

/** Derived from real user flags; there is no single status column. */
export const ACCOUNT_STATE: StatusMap<AccountState | "deleted"> = {
  active: {
    label: "Active",
    tone: "success",
    icon: CircleCheckIcon,
    description: "No restrictions.",
  },
  blocked: {
    label: "Blocked",
    tone: "danger",
    icon: BanIcon,
    description: "Locked out entirely: cannot sign in or transact.",
  },
  suspended: {
    label: "Suspended",
    tone: "warning",
    icon: PauseCircleIcon,
    description: "Can sign in but cannot transact.",
  },
  frozen: {
    label: "Frozen",
    tone: "info",
    icon: SnowflakeIcon,
    description:
      "Outbound transfers, bills and crypto purchases are held; inbound funds still arrive.",
  },
  locked: {
    label: "Locked",
    tone: "warning",
    icon: KeyRoundIcon,
    description: "Temporarily locked after repeated wrong passwords or PINs.",
  },
  unconfirmed: {
    label: "Email unverified",
    tone: "neutral",
    icon: MailWarningIcon,
    description: "Has not confirmed their email address.",
  },
  deleted: { label: "Deleted", tone: "neutral", icon: UserXIcon, description: "Account deleted." },
};

type StateInput = Pick<
  UserListItem,
  | "isBlocked"
  | "isSuspended"
  | "outboundRestricted"
  | "isConfirmed"
  | "loginLockedUntil"
  | "pinLockedUntil"
> & { deletedAt?: string | null };

/** Every restriction that applies, most severe first. */
export function accountStates(
  user: StateInput,
  now: Date = new Date(),
): (AccountState | "deleted")[] {
  const states: (AccountState | "deleted")[] = [];
  if (user.deletedAt) states.push("deleted");
  if (user.isBlocked) states.push("blocked");
  if (user.isSuspended) states.push("suspended");
  if (user.outboundRestricted) states.push("frozen");
  const lockedUntil = [user.loginLockedUntil, user.pinLockedUntil]
    .filter((v): v is string => Boolean(v))
    .some((v) => new Date(v) > now);
  if (lockedUntil) states.push("locked");
  if (!user.isConfirmed) states.push("unconfirmed");
  return states.length > 0 ? states : ["active"];
}

export function primaryAccountState(user: StateInput): AccountState | "deleted" {
  return accountStates(user)[0] ?? "active";
}
