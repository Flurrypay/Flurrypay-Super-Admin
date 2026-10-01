"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIcon,
  CircleCheckIcon,
  LayersIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHasPermission } from "@/features/auth/admin-context";
import { Metric } from "@/features/overview/metric";
import { humanizeEnum } from "@/lib/format";

import {
  fetchEngineHealth,
  type FlaggedAccount,
  resolveRestriction,
  RESTRICTION_ACTIONS,
  type RestrictionAction,
} from "./monitoring-api";

/**
 * Is the monitoring actually running?
 *
 * This is the question no other page answers. A detection system that has
 * silently stopped evaluating looks exactly like a quiet week: no alerts, no
 * cases, nothing overdue. Everyone downstream keeps believing they are
 * covered. So the freshness of the last evaluation is itself a control, and
 * it belongs on screen next to the numbers it underwrites.
 */

/** Beyond this, the solvency figures are stale enough to distrust. */
const STALE_AFTER_MS = 10 * 60_000;

function ageLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "never";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function EngineHealthPanel() {
  const canViewUsers = useHasPermission("users.view");
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState<FlaggedAccount | null>(null);

  const result = useQuery({
    queryKey: ["risk", "engine-health"],
    // The engine's own state is the one thing worth polling; a stopped sweep
    // should not wait for someone to hit refresh.
    refetchInterval: 60_000,
    queryFn: ({ signal }) => fetchEngineHealth(signal),
  });
  const health = result.data;

  // The API may omit the age entirely (no audit has completed since boot),
  // which is itself the stalest case rather than a missing value to ignore.
  const solvencyAgeMs = health?.solvencyAgeMs ?? null;
  const stale = health !== undefined && (solvencyAgeMs === null || solvencyAgeMs > STALE_AFTER_MS);
  const sweepStopped = health !== undefined && !health.systemStatus.active;

  const columns: DataColumn<FlaggedAccount>[] = [
    {
      id: "customer",
      header: "Customer",
      required: true,
      sensitive: true,
      cell: (a) => {
        const name =
          [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || a.userName || a.id;
        return canViewUsers ? (
          <Link href={`/users/${a.id}`} className="truncate hover:underline">
            {name}
          </Link>
        ) : (
          <span className="truncate">{name}</span>
        );
      },
      exportValue: (a) => [a.firstName, a.lastName].filter(Boolean).join(" "),
    },
    {
      id: "restriction",
      header: "Restriction",
      cell: (a) => (
        <span className="flex flex-wrap gap-1">
          {a.isBlocked && <Badge tone="danger">Blocked</Badge>}
          {a.isSuspended && <Badge tone="danger">Suspended</Badge>}
          {a.outboundRestricted && <Badge tone="warning">Outbound restricted</Badge>}
          {!a.isBlocked && !a.isSuspended && !a.outboundRestricted && (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      ),
      exportValue: (a) =>
        [a.isBlocked && "blocked", a.isSuspended && "suspended", a.outboundRestricted && "outbound"]
          .filter(Boolean)
          .join(" | "),
    },
    {
      id: "reason",
      header: "Reason",
      priority: "secondary",
      cell: (a) => (
        <span className="max-w-80 truncate text-xs text-muted-foreground">
          {a.outboundRestrictedReason ?? "—"}
        </span>
      ),
      exportValue: (a) => a.outboundRestrictedReason,
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      priority: "secondary",
      cell: (a) => <Amount value={a.walletBalance} currency="NGN" />,
      exportValue: (a) => a.walletBalance,
    },
    {
      id: "since",
      header: "Restricted",
      priority: "tertiary",
      cell: (a) => <DateTime value={a.outboundRestrictedAt} />,
      exportValue: (a) => a.outboundRestrictedAt,
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      {sweepStopped && (
        <Alert tone="danger">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Continuous monitoring is not active</AlertTitle>
          <AlertDescription>
            The platform sweep reports itself inactive. Transactions may be completing without being
            evaluated. Treat this as an operational security issue, not a display problem.
          </AlertDescription>
        </Alert>
      )}
      {!sweepStopped && stale && (
        <Alert tone="warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Risk figures are stale</AlertTitle>
          <AlertDescription>
            The last successful solvency evaluation was {ageLabel(solvencyAgeMs)}. The numbers below
            describe that moment, not now.
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Engine health" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Sweep status"
          value={health ? (health.systemStatus.active ? 0 : 1) : undefined}
          display={
            health ? (
              <Badge tone={health.systemStatus.active ? "success" : "danger"}>
                {health.systemStatus.active ? "Active" : "Stopped"}
              </Badge>
            ) : undefined
          }
          icon={health?.systemStatus.active ? CircleCheckIcon : ShieldAlertIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition={
            health
              ? `Active accounts re-evaluated every ${health.systemStatus.activePassInterval}; full platform every ${health.systemStatus.platformPassInterval}.`
              : "Whether the continuous transaction monitor reports itself running."
          }
        />
        <Metric
          label="Queue depth"
          value={health?.activeDirtyQueueSize}
          icon={LayersIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition="Accounts marked dirty and waiting for the next active pass. A number that only grows means the monitor is not keeping up."
        />
        <Metric
          label="Last evaluation"
          value={solvencyAgeMs ?? undefined}
          display={
            health ? (
              <span className={stale ? "font-semibold text-warning" : "font-semibold"}>
                {ageLabel(solvencyAgeMs)}
              </span>
            ) : undefined
          }
          icon={ActivityIcon}
          isPending={result.isPending}
          isError={result.isError}
          definition="Age of the most recent completed solvency audit. Read paths serve a cached report rather than re-auditing the platform on every request."
        />
        <Metric
          label="Restricted accounts"
          value={health?.flaggedAccountsCount}
          icon={ShieldAlertIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition="Accounts currently suspended or with outbound transfers restricted."
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {health?.solvencyReport?.overallStatus && (
          <span className="text-xs text-muted-foreground">
            Solvency:{" "}
            <Badge
              tone={
                health.solvencyReport.overallStatus === "OPTIMAL" ||
                health.solvencyReport.overallStatus === "STABLE"
                  ? "success"
                  : "danger"
              }
            >
              {humanizeEnum(health.solvencyReport.overallStatus)}
            </Badge>{" "}
            as at <DateTime value={health.solvencyGeneratedAt} />
          </span>
        )}
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>

      <DataTable
        label="Restricted accounts"
        subject="restricted accounts"
        columns={columns}
        rows={health?.flaggedAccounts ?? []}
        getRowId={(a) => a.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setReleasing}
        activeRowId={releasing?.id}
        empty={{
          icon: CircleCheckIcon,
          title: "No restricted accounts",
          description: "No customer is currently suspended or restricted from sending funds.",
        }}
      />
      {(health?.flaggedAccounts.length ?? 0) >= 100 && (
        <p className="text-xs text-muted-foreground">
          The API returns at most 100 restricted accounts.
        </p>
      )}

      <ReleaseDialog
        account={releasing}
        onClose={() => {
          setReleasing(null);
        }}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: ["risk"] });
          void queryClient.invalidateQueries({ queryKey: ["user"] });
          void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
        }}
      />
    </div>
  );
}

function ReleaseDialog({
  account,
  onClose,
  onDone,
}: {
  account: FlaggedAccount | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [action, setAction] = useState<RestrictionAction>("UNLOCK_OUTBOUND");
  const [reason, setReason] = useState("");
  const mutation = useMutation({ mutationFn: resolveRestriction });

  if (!account) return null;
  const name =
    [account.firstName, account.lastName].filter(Boolean).join(" ").trim() ||
    account.userName ||
    account.id;

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setReason("");
        }
      }}
      title="Lift restriction"
      description={`Restore access for ${name}. The change is recorded against your account.`}
      submitLabel="Lift restriction"
      tone="danger"
      validate={() =>
        reason.trim().length < 10 ? "Give a reason of at least 10 characters." : null
      }
      onSubmit={async () => {
        await mutation.mutateAsync({ userId: account.id, action, reason: reason.trim() });
        toast.success("Restriction lifted");
        onDone();
        onClose();
        setReason("");
      }}
    >
      <Field id="restriction-action" label="What to lift">
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v as RestrictionAction);
          }}
        >
          <SelectTrigger id="restriction-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESTRICTION_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {humanizeEnum(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        id="restriction-reason"
        label="Reason"
        hint="What was reviewed, and why the restriction is no longer warranted."
      >
        <Textarea
          id="restriction-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          rows={3}
        />
      </Field>
    </FormDialog>
  );
}
