"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type AdminPermission, PERMISSION_INFO } from "@/features/auth/permissions";
import { toAppError } from "@/lib/api/errors";
import { formatCount } from "@/lib/format";

import { createRole, type CustomRole, deleteRole, updateRole } from "./api";
import { administratorsQueryKey, rolesQuery } from "./labels";
import { PermissionPicker } from "./permission-picker";

function knownPermissions(permissions: readonly string[]): AdminPermission[] {
  return permissions.filter((p): p is AdminPermission => p in PERMISSION_INFO);
}

/** Reusable permission sets (super admin). Editing a role updates every staff admin assigned to it. */
export function RolesView() {
  const queryClient = useQueryClient();
  const roles = useQuery(rolesQuery);
  const [editing, setEditing] = useState<CustomRole | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomRole | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: rolesQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: administratorsQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);

  const remove = useMutation({
    mutationFn: ({ id, twoFACode }: { id: string; twoFACode: string }) =>
      deleteRole(id, { twoFACode }),
    onSuccess: async () => {
      toast.success("Role deleted");
      await refresh();
    },
  });

  const columns: DataColumn<CustomRole>[] = [
    {
      id: "name",
      header: "Role",
      required: true,
      cell: (r) => (
        <span className="grid leading-tight">
          <span className="font-medium">{r.name}</span>
          {r.description && (
            <span className="truncate text-xs text-muted-foreground">{r.description}</span>
          )}
        </span>
      ),
    },
    {
      id: "permissions",
      header: "Permissions",
      cell: (r) => {
        const perms = knownPermissions(r.permissions);
        if (perms.length === 0) return <span className="text-muted-foreground">None</span>;
        return (
          <ul className="flex flex-wrap gap-1">
            {perms.map((p) => (
              <li key={p}>
                <Badge tone={PERMISSION_INFO[p].risk === "standard" ? "neutral" : "warning"}>
                  {PERMISSION_INFO[p].label}
                </Badge>
              </li>
            ))}
          </ul>
        );
      },
    },
    {
      id: "assignedCount",
      header: "Assigned",
      align: "right",
      cell: (r) => <span className="tabular-nums">{formatCount(r.assignedCount)}</span>,
    },
    {
      id: "updatedAt",
      header: "Updated",
      priority: "secondary",
      cell: (r) => <DateTime value={r.updatedAt} format="date" />,
    },
    {
      id: "actions",
      header: "Actions",
      required: true,
      align: "right",
      cell: (r) => (
        <span className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Edit ${r.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditing(r);
            }}
          >
            <PencilIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            aria-label={`Delete ${r.name}`}
            disabled={r.assignedCount > 0}
            title={r.assignedCount > 0 ? "Reassign its administrators before deleting" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              setDeleting(r);
            }}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-2">
        <Freshness
          updatedAt={roles.dataUpdatedAt}
          isFetching={roles.isFetching}
          onRefresh={() => void roles.refetch()}
        />
        <Button
          size="sm"
          onClick={() => {
            setEditing("new");
          }}
        >
          <PlusIcon aria-hidden />
          New role
        </Button>
      </div>
      <DataTable
        label="Roles"
        subject="roles"
        columns={columns}
        rows={roles.data ?? []}
        getRowId={(r) => r.id}
        isLoading={roles.isFetching}
        error={roles.error}
        onRetry={() => void roles.refetch()}
        onRowActivate={setEditing}
        empty={{
          icon: ShieldCheckIcon,
          title: "No roles yet",
          description:
            "Create a role such as “Support” or “Compliance analyst” to grant the same permissions consistently.",
        }}
      />

      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}

      <ConfirmActionDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete role"
        target={<span className="font-medium">{deleting?.name}</span>}
        impact="The role is deleted. No administrator is assigned to it, so nobody's access changes."
        confirmLabel="Delete role"
        tone="danger"
        stepUp={{ twoFactor: true }}
        onConfirm={({ twoFACode }) =>
          deleting
            ? remove.mutateAsync({ id: deleting.id, twoFACode: twoFACode ?? "" })
            : Promise.resolve()
        }
      />
    </div>
  );
}

function RoleDialog({
  role,
  onClose,
  onSaved,
}: {
  role: CustomRole | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<AdminPermission[]>(
    knownPermissions(role?.permissions ?? []).filter((p) => PERMISSION_INFO[p].grantable),
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        description: description.trim(),
        permissions,
        twoFACode: code.trim(),
      };
      return role ? updateRole(role.id, input) : createRole(input);
    },
  });

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give the role a name.");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    try {
      const result = await save.mutateAsync();
      const affected = "affectedAdmins" in result ? Number(result.affectedAdmins) : 0;
      toast.success(
        role
          ? `Role updated${affected > 0 ? ` for ${formatCount(affected)} administrators` : ""}`
          : "Role created",
      );
      await onSaved();
      onClose();
    } catch (caught) {
      setError(toAppError(caught).userMessage);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
            <DialogDescription>
              A named set of permissions to assign to staff administrators. Recorded in the audit
              log.
            </DialogDescription>
          </DialogHeader>
          {role && role.assignedCount > 0 && (
            <Alert tone="warning">
              <TriangleAlertIcon aria-hidden />
              <AlertDescription className="text-foreground">
                Saving changes the access of {formatCount(role.assignedCount)} administrator
                {role.assignedCount === 1 ? "" : "s"} assigned to this role on their next request.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="role-description">Description (optional)</Label>
            <Textarea
              id="role-description"
              value={description}
              maxLength={500}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Permissions</Label>
            <PermissionPicker value={permissions} onChange={setPermissions} />
          </div>
          <div className="grid max-w-56 gap-1.5">
            <Label htmlFor="role-2fa">Your authenticator code</Label>
            <Input
              id="role-2fa"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="font-mono tracking-widest"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
              {role ? "Save role" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
