"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRightIcon, LandmarkIcon, PlusCircleIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Field,
  FormDialog,
  TwoFactorField,
  validateTwoFactor,
} from "@/components/confirm/form-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/features/auth/admin-context";
import { isSuperAdmin } from "@/features/auth/permissions";
import { getUserMessage } from "@/lib/api/errors";
import { humanizeEnum } from "@/lib/format";

import { type PayoutProvider, switchPayoutProvider, syncProviderBalance } from "./api";
import { TopUpDialog } from "./top-up-dialog";

/**
 * The naira side of the treasury: every settlement and payout account.
 *
 * The account number is shown in full rather than masked. It is the company's
 * own account, it is the answer to "where do I send the float", and a masked
 * number cannot be transferred to. The endpoint behind it requires
 * `treasury.view`.
 */
export function AccountsPanel({
  providers,
  isLoading,
  error,
  onRetry,
}: {
  providers: PayoutProvider[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const admin = useAdmin();
  const canSwitch = isSuperAdmin(admin);
  const queryClient = useQueryClient();
  const [topUp, setTopUp] = useState<PayoutProvider | null>(null);
  const [switching, setSwitching] = useState<PayoutProvider | null>(null);

  const sync = useMutation({
    mutationFn: syncProviderBalance,
    onSuccess: () => {
      toast.success("Balance re-read from the provider");
      void queryClient.invalidateQueries({ queryKey: ["treasury"] });
    },
    onError: (err) => toast.error(getUserMessage(err)),
  });

  const columns: DataColumn<PayoutProvider>[] = [
    {
      id: "name",
      header: "Account",
      required: true,
      cell: (p) => (
        <span className="grid leading-tight">
          <span className="font-medium">{p.name || humanizeEnum(p.provider)}</span>
          <span className="text-xs text-muted-foreground">
            {[p.bankName, p.accountName].filter(Boolean).join(" · ") || humanizeEnum(p.provider)}
          </span>
        </span>
      ),
      exportValue: (p) => p.name,
    },
    {
      id: "accountNumber",
      header: "Account number",
      priority: "secondary",
      cell: (p) => <Identifier value={p.accountNumber} label="account number" />,
      exportValue: (p) => p.accountNumber,
    },
    {
      id: "state",
      header: "State",
      cell: (p) => (
        <span className="flex flex-wrap gap-1">
          {p.isActive && <Badge tone="success">Active</Badge>}
          {p.isDefault && <Badge tone="neutral">Default</Badge>}
          {p.environment && <Badge tone="info">{humanizeEnum(p.environment)}</Badge>}
          {!p.hasApiKey && <Badge tone="warning">Not configured</Badge>}
        </span>
      ),
      exportValue: (p) => (p.isActive ? "active" : "inactive"),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      description:
        "Last figure read from the provider. Sync re-reads it; it is not live on every page load.",
      cell: (p) => <Amount value={p.cachedBalance} currency="NGN" />,
      exportValue: (p) => p.cachedBalance,
    },
    {
      id: "synced",
      header: "Synced",
      priority: "secondary",
      cell: (p) => <DateTime value={p.lastSyncedAt} />,
      exportValue: (p) => p.lastSyncedAt,
    },
    {
      id: "actions",
      header: "",
      required: true,
      align: "right",
      cell: (p) => (
        <span className="flex justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={sync.isPending}
            onClick={() => {
              sync.mutate(p.id);
            }}
          >
            <RefreshCwIcon aria-hidden />
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTopUp(p);
            }}
          >
            <PlusCircleIcon aria-hidden />
            Top up
          </Button>
          {canSwitch && !p.isActive && p.hasApiKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSwitching(p);
              }}
            >
              <ArrowLeftRightIcon aria-hidden />
              Make active
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <DataTable
        label="Payout accounts"
        subject="payout accounts"
        columns={columns}
        rows={providers}
        getRowId={(p) => p.id}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        empty={{
          icon: LandmarkIcon,
          title: "No payout accounts",
          description: "Settlement and payout accounts configured in the API appear here.",
        }}
      />
      <p className="text-xs text-muted-foreground">
        Funding an account is a bank transfer into it — there is no endpoint that moves money in.
        Top up shows where to send. Only a super admin can change which account customer payouts
        leave from.
      </p>

      {topUp && (
        <TopUpDialog
          key={topUp.id}
          target={{ kind: "fiat", provider: topUp }}
          open
          onOpenChange={(next) => {
            if (!next) setTopUp(null);
          }}
        />
      )}

      {switching && (
        <SwitchProviderDialog
          key={switching.id}
          provider={switching}
          onClose={() => {
            setSwitching(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Change which account customer payouts leave from.
 *
 * Confirmed with a typed phrase and an authenticator code, because the
 * consequence is invisible from this screen: nothing about the console changes,
 * but every customer withdrawal from this moment draws on a different balance.
 * Getting it wrong means payouts failing for lack of funds in an account nobody
 * thought was in use.
 */
function SwitchProviderDialog({
  provider,
  onClose,
}: {
  provider: PayoutProvider;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [twoFACode, setTwoFACode] = useState("");

  const mutation = useMutation({
    mutationFn: () => switchPayoutProvider(provider.id, twoFACode.trim()),
    onSuccess: () => {
      toast.success(`Customer payouts now leave from ${provider.name}`);
      void queryClient.invalidateQueries({ queryKey: ["treasury"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Make this the active payout account"
      tone="danger"
      description={
        <>
          Every customer withdrawal from now on will be paid from <strong>{provider.name}</strong>.
          If it does not hold enough, payouts start failing.
        </>
      }
      submitLabel="Switch payout account"
      validate={() => validateTwoFactor(twoFACode)}
      onSubmit={() => mutation.mutateAsync()}
    >
      <Field id="switch-balance" label="Balance on this account">
        <p className="text-sm">
          <Amount value={provider.cachedBalance} currency="NGN" className="font-semibold" />{" "}
          <span className="text-muted-foreground">
            as of <DateTime value={provider.lastSyncedAt} format="relative" />
          </span>
        </p>
      </Field>
      <TwoFactorField value={twoFACode} onChange={setTwoFACode} />
    </FormDialog>
  );
}
