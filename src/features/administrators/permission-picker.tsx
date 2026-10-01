"use client";

import { LockIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ADMIN_PERMISSIONS,
  type AdminPermission,
  PERMISSION_INFO,
  type PermissionRisk,
} from "@/features/auth/permissions";

const RISK_BADGE: Record<
  Exclude<PermissionRisk, "standard">,
  { label: string; tone: "warning" | "danger" }
> = {
  elevated: { label: "Elevated", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
};

const GROUPS = [...new Set(ADMIN_PERMISSIONS.map((p) => PERMISSION_INFO[p].group))];

interface PermissionPickerProps {
  value: readonly AdminPermission[];
  onChange: (value: AdminPermission[]) => void;
  disabled?: boolean;
}

/**
 * Grouped permission selection. Only permissions the API accepts for staff are
 * selectable (STAFF_GRANTABLE_PERMISSIONS); company withdrawals stay super-admin only.
 */
export function PermissionPicker({ value, onChange, disabled = false }: PermissionPickerProps) {
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const term = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        permissions: ADMIN_PERMISSIONS.filter((p) => {
          const info = PERMISSION_INFO[p];
          return (
            info.group === group &&
            (!term ||
              info.label.toLowerCase().includes(term) ||
              info.description.toLowerCase().includes(term) ||
              p.includes(term))
          );
        }),
      })).filter((g) => g.permissions.length > 0),
    [term],
  );

  function set(next: Set<AdminPermission>) {
    onChange(ADMIN_PERMISSIONS.filter((p) => next.has(p)));
  }

  function toggle(permission: AdminPermission, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(permission);
    else next.delete(permission);
    set(next);
  }

  function setGroup(permissions: readonly AdminPermission[], checked: boolean) {
    const next = new Set(selected);
    for (const p of permissions) {
      if (!PERMISSION_INFO[p].grantable) continue;
      if (checked) next.add(p);
      else next.delete(p);
    }
    set(next);
  }

  const criticalSelected = value.filter((p) => PERMISSION_INFO[p].risk === "critical");

  return (
    <div className="grid gap-3">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search permissions"
          aria-label="Search permissions"
          className="h-8 pl-8"
          disabled={disabled}
        />
      </div>

      <div className="grid max-h-80 gap-3 overflow-y-auto pr-1">
        {groups.map(({ group, permissions }) => {
          const grantable = permissions.filter((p) => PERMISSION_INFO[p].grantable);
          const allOn = grantable.length > 0 && grantable.every((p) => selected.has(p));
          return (
            <fieldset key={group} className="rounded-md border" disabled={disabled}>
              <legend className="sr-only">{group}</legend>
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
                <span className="text-sm font-medium">{group}</span>
                {grantable.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    onClick={() => {
                      setGroup(grantable, !allOn);
                    }}
                  >
                    {allOn ? "Clear" : "Select all"}
                  </button>
                )}
              </div>
              <ul className="divide-y">
                {permissions.map((permission) => {
                  const info = PERMISSION_INFO[permission];
                  const id = `perm-${permission}`;
                  const badge = info.risk !== "standard" ? RISK_BADGE[info.risk] : null;
                  return (
                    <li key={permission} className="flex items-start gap-2.5 px-3 py-2">
                      {info.grantable ? (
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={selected.has(permission)}
                          onCheckedChange={(checked) => {
                            toggle(permission, checked === true);
                          }}
                          aria-describedby={`${id}-desc`}
                        />
                      ) : (
                        <LockIcon
                          className="mt-0.5 size-4 text-muted-foreground"
                          aria-label="Not grantable"
                        />
                      )}
                      <label
                        htmlFor={info.grantable ? id : undefined}
                        className="grid flex-1 gap-0.5"
                      >
                        <span className="flex flex-wrap items-center gap-1.5 text-sm">
                          {info.label}
                          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                          <code className="text-[11px] text-muted-foreground">{permission}</code>
                        </span>
                        <span id={`${id}-desc`} className="text-xs text-muted-foreground">
                          {info.grantable
                            ? info.description
                            : `${info.description} It can never be granted to staff.`}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
        {groups.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">No permissions match.</p>
        )}
      </div>

      {criticalSelected.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          Critical permissions selected:{" "}
          {criticalSelected.map((p) => PERMISSION_INFO[p].label).join(", ")}. Grant these only to
          people whose job requires them.
        </p>
      )}
    </div>
  );
}
