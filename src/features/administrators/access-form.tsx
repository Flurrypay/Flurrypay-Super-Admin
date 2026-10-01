"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldAlertIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADMIN_ROLES,
  type AdminPermission,
  type AdminRole,
  PERMISSION_INFO,
  ROLE_INFO,
} from "@/features/auth/permissions";

import { rolesQuery } from "./labels";
import { PermissionPicker } from "./permission-picker";

export interface AccessValue {
  role: AdminRole;
  permissions: AdminPermission[];
  /** A custom role supplies the permissions; null means they are picked individually. */
  customRoleId: string | null;
}

const INDIVIDUAL = "__individual__";

function grantable(permissions: readonly string[]): AdminPermission[] {
  return permissions.filter(
    (p): p is AdminPermission =>
      p in PERMISSION_INFO && PERMISSION_INFO[p as AdminPermission].grantable,
  );
}

/** Role and permission selection with a plain-language preview of the resulting access. */
export function AccessForm({
  value,
  onChange,
}: {
  value: AccessValue;
  onChange: (value: AccessValue) => void;
}) {
  const isSuper = value.role === "superAdmin";
  const roles = useQuery(rolesQuery);
  const customRole = roles.data?.find((r) => r.id === value.customRoleId);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="access-role">Role</Label>
        <Select
          value={value.role}
          onValueChange={(role) => {
            onChange({
              role: role as AdminRole,
              permissions: role === "superAdmin" ? [] : value.permissions,
              customRoleId: role === "superAdmin" ? null : value.customRoleId,
            });
          }}
        >
          <SelectTrigger id="access-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_INFO[role].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{ROLE_INFO[value.role].description}</p>
      </div>

      {isSuper ? (
        <Alert tone="warning">
          <ShieldAlertIcon aria-hidden />
          <AlertDescription className="text-foreground">
            Super admins have every permission, including managing administrators and withdrawing
            company funds. Keep this role to as few people as possible.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="access-permission-set">Permission set</Label>
            <Select
              value={value.customRoleId ?? INDIVIDUAL}
              disabled={roles.isPending}
              onValueChange={(id) => {
                if (id === INDIVIDUAL) {
                  onChange({ ...value, customRoleId: null });
                  return;
                }
                const role = roles.data?.find((r) => r.id === id);
                if (role) {
                  onChange({
                    ...value,
                    customRoleId: role.id,
                    permissions: grantable(role.permissions),
                  });
                }
              }}
            >
              <SelectTrigger id="access-permission-set">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INDIVIDUAL}>Choose permissions individually</SelectItem>
                {roles.data?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {customRole ? (
                "Permissions follow the role: editing the role later updates everyone assigned to it."
              ) : roles.isError ? (
                "Custom roles could not be loaded."
              ) : (
                <>
                  Reusable permission sets are managed under{" "}
                  <Link href="/administrators/roles" className="underline underline-offset-2">
                    Roles
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Permissions</Label>
            <PermissionPicker
              value={value.permissions}
              disabled={Boolean(customRole)}
              onChange={(permissions) => {
                onChange({ ...value, permissions, customRoleId: null });
              }}
            />
          </div>
        </>
      )}

      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm" aria-live="polite">
        <p className="font-medium">Access preview</p>
        {isSuper ? (
          <p className="text-muted-foreground">Full access to every section and action.</p>
        ) : value.permissions.length === 0 ? (
          <p className="text-muted-foreground">
            No permissions: this person will only see the Overview and their own Security settings.
          </p>
        ) : (
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {value.permissions.map((p) => (
              <li key={p}>{PERMISSION_INFO[p].label}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
