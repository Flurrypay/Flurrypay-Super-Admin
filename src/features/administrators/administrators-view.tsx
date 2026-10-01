"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheckIcon, UserCogIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ADMIN_PERMISSIONS,
  type AdminPermission,
  PERMISSION_INFO,
  ROLE_INFO,
} from "@/features/auth/permissions";

import { type AdminAccount, fetchAdministrators } from "./api";
import { InviteDialog } from "./invite-dialog";
import { ADMIN_STATE, administratorsQueryKey, adminState, rolesQuery } from "./labels";

const GRANTABLE_COUNT = ADMIN_PERMISSIONS.filter((p) => PERMISSION_INFO[p].grantable).length;

function PermissionSummary({ admin, roleName }: { admin: AdminAccount; roleName?: string }) {
  if (admin.role === "superAdmin") return <span className="text-muted-foreground">All</span>;
  const known = admin.permissions.filter((p): p is AdminPermission => p in PERMISSION_INFO);
  if (known.length === 0) return <span className="text-muted-foreground">None</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="underline decoration-dotted underline-offset-2">
          {roleName ?? `${known.length} of ${GRANTABLE_COUNT}`}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <ul>
          {known.map((p) => (
            <li key={p}>{PERMISSION_INFO[p].label}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function buildColumns(roleNames: ReadonlyMap<string, string>): DataColumn<AdminAccount>[] {
  return [
    {
      id: "name",
      header: "Administrator",
      required: true,
      cell: (a) => (
        <span className="grid leading-tight">
          <Link href={`/administrators/${a.id}`} className="font-medium hover:underline">
            {`${a.firstName} ${a.lastName}`.trim() || a.email}
          </Link>
          <span className="text-xs text-muted-foreground">{a.email}</span>
        </span>
      ),
    },
    {
      id: "role",
      header: "Role",
      cell: (a) => (
        <Badge tone={a.role === "superAdmin" ? "accent" : "neutral"}>
          {ROLE_INFO[a.role].label}
        </Badge>
      ),
    },
    {
      id: "permissions",
      header: "Permissions",
      description: "The custom role, where one is assigned, or the number of permissions granted.",
      cell: (a) => (
        <PermissionSummary
          admin={a}
          roleName={a.customRoleId ? roleNames.get(a.customRoleId) : undefined}
        />
      ),
    },
    {
      id: "security",
      header: "Security",
      description: "Two-factor authentication, verified phone and trusted devices.",
      cell: (a) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={a.hasActivated2FA ? "success" : "warning"}>
            {a.hasActivated2FA ? "2FA on" : "2FA off"}
          </Badge>
          {!a.phoneNumber && <Badge tone="warning">No phone</Badge>}
          <Badge tone="neutral">
            {a.trustedDeviceCount} device{a.trustedDeviceCount === 1 ? "" : "s"}
          </Badge>
        </span>
      ),
    },
    {
      id: "lastLoginAt",
      header: "Last sign-in",
      priority: "secondary",
      description:
        "Recorded from this release onwards; older sign-ins are on the administrator's page.",
      cell: (a) => (
        <span className="flex items-center gap-1.5">
          {a.hasActiveSession && (
            <span className="size-1.5 rounded-full bg-success" aria-label="Signed in now" />
          )}
          <DateTime value={a.lastLoginAt} format="date" />
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (a) => (
        <span className="grid gap-0.5">
          <StatusBadge status={resolveStatus(ADMIN_STATE, adminState(a))} />
          {adminState(a) === "setup" && a.invitationExpiresAt && (
            <span className="text-xs text-muted-foreground">
              Expires <DateTime value={a.invitationExpiresAt} format="date" />
            </span>
          )}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: "Added",
      priority: "secondary",
      cell: (a) => <DateTime value={a.createdAt} format="date" />,
    },
  ];
}

export function AdministratorsView() {
  const router = useRouter();
  const result = useQuery({
    queryKey: administratorsQueryKey,
    queryFn: ({ signal }) => fetchAdministrators(signal),
  });
  const roles = useQuery(rolesQuery);
  const rows = useMemo(() => result.data ?? [], [result.data]);
  const columns = useMemo(
    () => buildColumns(new Map((roles.data ?? []).map((r) => [r.id, r.name]))),
    [roles.data],
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-2">
        <Freshness
          updatedAt={result.dataUpdatedAt}
          isFetching={result.isFetching}
          onRefresh={() => void result.refetch()}
        />
        <Button asChild variant="outline" size="sm">
          <Link href="/administrators/roles">
            <ShieldCheckIcon aria-hidden />
            Roles
          </Link>
        </Button>
        <InviteDialog />
      </div>
      <DataTable
        label="Administrators"
        subject="administrators"
        columns={columns}
        rows={rows}
        getRowId={(a) => a.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={(a) => {
          router.push(`/administrators/${a.id}` as Route);
        }}
        empty={{
          icon: UserCogIcon,
          title: "No administrators",
          description: "Invite a colleague to get started.",
        }}
      />
    </div>
  );
}
