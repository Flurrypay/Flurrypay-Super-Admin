"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BanIcon,
  ChevronDownIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  ShieldIcon,
  SnowflakeIcon,
  SunIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import {
  ConfirmActionDialog,
  type ConfirmValues,
} from "@/components/confirm/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHasPermission } from "@/features/auth/admin-context";

import {
  blockUser,
  freezeUser,
  suspendUser,
  unblockUser,
  unfreezeUser,
  unsuspendUser,
  type UserDetail,
} from "./api";
import { userDisplayName } from "./queries";

type ActionId = "block" | "unblock" | "suspend" | "unsuspend" | "freeze" | "unfreeze";

interface ActionSpec {
  label: string;
  icon: typeof BanIcon;
  impact: string;
  confirmLabel: string;
  tone: "default" | "danger";
  reason?: { required: boolean; minLength: number; hint: string };
  run: (id: string, values: ConfirmValues) => Promise<unknown>;
  done: string;
}

const ACTIONS: Record<ActionId, ActionSpec> = {
  block: {
    label: "Block account",
    icon: BanIcon,
    impact:
      "The customer is signed out immediately and cannot sign in or transact. Pending referral rewards are clawed back, and they are notified by email and push.",
    confirmLabel: "Block account",
    tone: "danger",
    reason: {
      required: true,
      minLength: 10,
      hint: "Recorded in the audit log. The customer sees a standard “blocked by admin” notice.",
    },
    run: (id, { reason, twoFACode }) => blockUser(id, reason, { twoFACode: twoFACode ?? "" }),
    done: "Account blocked",
  },
  unblock: {
    label: "Unblock account",
    icon: PlayCircleIcon,
    impact: "The customer can sign in and transact again.",
    confirmLabel: "Unblock",
    tone: "default",
    run: (id, { twoFACode }) => unblockUser(id, { twoFACode: twoFACode ?? "" }),
    done: "Account unblocked",
  },
  suspend: {
    label: "Suspend transacting",
    icon: PauseCircleIcon,
    impact:
      "The customer can still sign in but cannot make transactions. They are emailed your reason.",
    confirmLabel: "Suspend",
    tone: "danger",
    reason: {
      required: true,
      minLength: 10,
      hint: "Sent to the customer and recorded in the audit log.",
    },
    run: (id, { reason, twoFACode }) => suspendUser(id, reason, { twoFACode: twoFACode ?? "" }),
    done: "Account suspended",
  },
  unsuspend: {
    label: "Lift suspension",
    icon: PlayCircleIcon,
    impact: "The customer can transact again.",
    confirmLabel: "Lift suspension",
    tone: "default",
    run: (id, { twoFACode }) => unsuspendUser(id, { twoFACode: twoFACode ?? "" }),
    done: "Suspension lifted",
  },
  freeze: {
    label: "Freeze outbound funds",
    icon: SnowflakeIcon,
    impact:
      "Outbound transfers, bill payments and crypto purchases are held. Incoming funds still arrive. The customer is emailed your reason.",
    confirmLabel: "Freeze",
    tone: "danger",
    reason: {
      required: true,
      minLength: 10,
      hint: "Sent to the customer and recorded in the audit log.",
    },
    run: (id, { reason, twoFACode }) => freezeUser(id, reason, { twoFACode: twoFACode ?? "" }),
    done: "Outbound funds frozen",
  },
  unfreeze: {
    label: "Unfreeze outbound funds",
    icon: SunIcon,
    impact: "Outbound transfers, bills and crypto purchases are allowed again.",
    confirmLabel: "Unfreeze",
    tone: "default",
    run: (id, { twoFACode }) => unfreezeUser(id, { twoFACode: twoFACode ?? "" }),
    done: "Outbound funds unfrozen",
  },
};

/** Account controls for one customer. Every action is confirmed and recorded by the API's audit log. */
export function UserActions({ user }: { user: UserDetail }) {
  const canManage = useHasPermission("users.manage");
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ActionId | null>(null);

  const mutation = useMutation({
    mutationFn: ({ action, values }: { action: ActionId; values: ConfirmValues }) =>
      ACTIONS[action].run(user.id, values),
    onSuccess: async (_data, { action }) => {
      toast.success(`${ACTIONS[action].done}: ${userDisplayName(user)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
  });

  if (!canManage) return null;

  const available: ActionId[] = [
    user.isBlocked ? "unblock" : "block",
    user.isSuspended ? "unsuspend" : "suspend",
    user.outboundRestricted ? "unfreeze" : "freeze",
  ];
  const spec = pending ? ACTIONS[pending] : null;

  const item = (id: ActionId): ReactNode => {
    const action = ACTIONS[id];
    const Icon = action.icon;
    return (
      <DropdownMenuItem
        key={id}
        variant={action.tone === "danger" ? "destructive" : "default"}
        onSelect={() => {
          setPending(id);
        }}
      >
        <Icon aria-hidden />
        {action.label}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ShieldIcon aria-hidden />
            Account controls
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Restrictions</DropdownMenuLabel>
          {available.filter((id) => !ACTIONS[id].reason).map(item)}
          {available.some((id) => !ACTIONS[id].reason) && <DropdownMenuSeparator />}
          {available.filter((id) => ACTIONS[id].reason).map(item)}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={spec !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={spec?.label ?? ""}
        target={
          <span className="grid">
            <span className="font-medium">{userDisplayName(user)}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </span>
        }
        impact={spec?.impact}
        confirmLabel={spec?.confirmLabel ?? "Confirm"}
        tone={spec?.tone}
        reason={spec?.reason}
        // Every account control is `users.manage` + step-up 2FA server-side —
        // including the ones that lift a restriction. Asking for the code here
        // is what turns the API's refusal into a form field rather than an
        // error the admin cannot act on.
        stepUp={{ twoFactor: true }}
        onConfirm={(values) =>
          pending ? mutation.mutateAsync({ action: pending, values }) : Promise.resolve()
        }
      />
    </>
  );
}
