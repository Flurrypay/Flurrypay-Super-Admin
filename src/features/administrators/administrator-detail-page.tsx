"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MailIcon,
  MailXIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  Trash2Icon,
  UserXIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuditLog } from "@/features/audit/api";
import { AuditTable } from "@/features/audit/audit-view";
import { useAdmin } from "@/features/auth/admin-context";
import {
  type AdminPermission,
  isAdminRole,
  PERMISSION_INFO,
  ROLE_INFO,
} from "@/features/auth/permissions";
import { toAppError } from "@/lib/api/errors";

import { AccessForm, type AccessValue } from "./access-form";
import {
  type AdminAccount,
  fetchAdministrators,
  invitationState,
  removeAdministrator,
  resendInvitation,
  revokeAdministratorSessions,
  revokeInvitation,
  suspendAdministrator,
  unsuspendAdministrator,
  updateAdministratorAccess,
} from "./api";
import { ADMIN_STATE, administratorsQueryKey, adminState, rolesQuery } from "./labels";

type Action =
  "suspend" | "unsuspend" | "remove" | "revokeSessions" | "resendInvitation" | "revokeInvitation";
type Pending = Action | null;

const ACTION_COPY: Record<
  Action,
  { title: string; impact: string; confirm: string; done: string; tone: "default" | "danger" }
> = {
  suspend: {
    title: "Suspend administrator",
    impact: "Every request from this account is refused immediately, including any open session.",
    confirm: "Suspend",
    done: "Administrator suspended",
    tone: "danger",
  },
  unsuspend: {
    title: "Reinstate administrator",
    impact: "The account can sign in and use its permissions again.",
    confirm: "Reinstate",
    done: "Administrator reinstated",
    tone: "default",
  },
  remove: {
    title: "Remove administrator",
    impact: "The account is deleted permanently. Their past actions remain in the audit log.",
    confirm: "Remove permanently",
    done: "Administrator removed",
    tone: "danger",
  },
  revokeSessions: {
    title: "Sign out everywhere",
    impact:
      "Their current session ends on the next request and every trusted device is forgotten, so their next sign-in needs device verification again.",
    confirm: "Sign out everywhere",
    done: "Sessions revoked",
    tone: "danger",
  },
  resendInvitation: {
    title: "Resend invitation",
    impact:
      "A new temporary password is emailed and the old one stops working. The invitation is valid for another 72 hours.",
    confirm: "Resend invitation",
    done: "Invitation resent",
    tone: "default",
  },
  revokeInvitation: {
    title: "Revoke invitation",
    impact:
      "The invited account is deleted before it is ever used. You can invite the person again later.",
    confirm: "Revoke invitation",
    done: "Invitation revoked",
    tone: "danger",
  },
};

export function AdministratorDetailPage({ adminId }: { adminId: string }) {
  const me = useAdmin();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending>(null);
  const [editing, setEditing] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditSize, setAuditSize] = useState(25);

  // There is no single-admin endpoint; the list is small and shared with the Administrators page.
  const list = useQuery({
    queryKey: administratorsQueryKey,
    queryFn: ({ signal }) => fetchAdministrators(signal),
  });
  const roles = useQuery(rolesQuery);
  // Accounts that last signed in before lastLoginAt was recorded fall back to the audit log.
  const needsAuditLogin = list.data?.find((a) => a.id === adminId)?.lastLoginAt === null;
  const lastLogin = useQuery({
    queryKey: ["admin-last-login", adminId],
    queryFn: ({ signal }) =>
      fetchAuditLog({ page: 1, pageSize: 1, adminId, action: "ADMIN_LOGIN" }, signal),
    enabled: needsAuditLogin,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: administratorsQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);

  const mutate = useMutation({
    mutationFn: async ({
      action,
      reason,
      twoFACode,
    }: {
      action: Action;
      reason: string;
      twoFACode: string;
    }) => {
      switch (action) {
        case "suspend":
          return suspendAdministrator(adminId, { reason, twoFACode });
        case "unsuspend":
          return unsuspendAdministrator(adminId, { twoFACode });
        case "remove":
          return removeAdministrator(adminId, { twoFACode });
        case "revokeSessions":
          return revokeAdministratorSessions(adminId, { twoFACode });
        case "resendInvitation":
          return resendInvitation(adminId, { twoFACode });
        case "revokeInvitation":
          return revokeInvitation(adminId, { twoFACode });
      }
    },
    onSuccess: async (_data, { action }) => {
      toast.success(ACTION_COPY[action].done);
      await refresh();
      if (action === "remove" || action === "revokeInvitation") router.replace("/administrators");
    },
  });

  const crumbs = (
    <Breadcrumbs
      items={[{ label: "Administrators", href: "/administrators" }, { label: "Administrator" }]}
    />
  );

  if (list.isPending) {
    return (
      <div className="grid gap-4">
        {crumbs}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <>
        {crumbs}
        <ErrorState
          error={list.error}
          subject="this administrator"
          onRetry={() => void list.refetch()}
        />
      </>
    );
  }
  const admin = list.data.find((a) => a.id === adminId);
  if (!admin) {
    return (
      <>
        {crumbs}
        <EmptyState
          icon={UserXIcon}
          title="Administrator not found"
          description="This account doesn't exist or was removed."
        />
      </>
    );
  }

  const isSelf = admin.id === me.id;
  const isSuper = admin.role === "superAdmin";
  const name = `${admin.firstName} ${admin.lastName}`.trim() || admin.email;
  const permissions = admin.permissions.filter((p): p is AdminPermission => p in PERMISSION_INFO);
  const lastLoginAt = admin.lastLoginAt ?? lastLogin.data?.rows[0]?.createdAt ?? null;
  const invitation = invitationState(admin);
  const customRole = roles.data?.find((r) => r.id === admin.customRoleId);
  const copy = pending ? ACTION_COPY[pending] : null;
  const open = (action: Action) => () => {
    setPending(action);
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow={crumbs}
        title={name}
        description={admin.email}
        actions={
          isSelf ? (
            <p className="text-xs text-muted-foreground">You can&apos;t change your own access.</p>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <KeyRoundIcon aria-hidden />
                Edit access
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    More actions
                    <ChevronDownIcon aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {invitation !== "accepted" && (
                    <>
                      <DropdownMenuItem onSelect={open("resendInvitation")}>
                        <MailIcon aria-hidden />
                        Resend invitation
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={open("revokeInvitation")}>
                        <MailXIcon aria-hidden />
                        Revoke invitation
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {invitation === "accepted" && (
                    <DropdownMenuItem onSelect={open("revokeSessions")}>
                      <LogOutIcon aria-hidden />
                      Sign out everywhere
                    </DropdownMenuItem>
                  )}
                  {admin.isSuspended ? (
                    <DropdownMenuItem onSelect={open("unsuspend")}>
                      <PlayCircleIcon aria-hidden />
                      Reinstate
                    </DropdownMenuItem>
                  ) : (
                    !isSuper && (
                      <DropdownMenuItem variant="destructive" onSelect={open("suspend")}>
                        <PauseCircleIcon aria-hidden />
                        Suspend
                      </DropdownMenuItem>
                    )
                  )}
                  <DropdownMenuItem variant="destructive" onSelect={open("remove")}>
                    <Trash2Icon aria-hidden />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection title="Account">
          <DetailList
            items={[
              {
                label: "Status",
                value: <StatusBadge status={resolveStatus(ADMIN_STATE, adminState(admin))} />,
              },
              { label: "Suspension reason", value: admin.suspensionReason, hideWhenEmpty: true },
              {
                label: "Suspended",
                value: <DateTime value={admin.suspendedAt} />,
                hideWhenEmpty: !admin.suspendedAt,
              },
              {
                label: "Invitation expires",
                value: <DateTime value={admin.invitationExpiresAt} />,
                hideWhenEmpty: invitation === "accepted" || !admin.invitationExpiresAt,
              },
              { label: "Username", value: admin.userName },
              { label: "Added", value: <DateTime value={admin.createdAt} /> },
              {
                label: "Last sign-in",
                value:
                  needsAuditLogin && lastLogin.isPending ? (
                    <Skeleton className="h-4 w-32" />
                  ) : (
                    <DateTime value={lastLoginAt} />
                  ),
              },
              {
                label: "Administrator ID",
                value: <Identifier value={admin.id} label="administrator ID" />,
              },
            ]}
          />
        </DetailSection>

        <DetailSection title="Security">
          <DetailList
            items={[
              {
                label: "Two-factor",
                value: (
                  <Badge tone={admin.hasActivated2FA ? "success" : "warning"}>
                    {admin.hasActivated2FA ? "Enabled" : "Not enabled"}
                  </Badge>
                ),
              },
              {
                label: "Phone",
                value: admin.phoneNumber ? (
                  <span className="font-mono text-xs">{admin.phoneNumber}</span>
                ) : null,
              },
              {
                label: "Session",
                value: (
                  <Badge tone={admin.hasActiveSession ? "success" : "neutral"}>
                    {admin.hasActiveSession ? "Signed in" : "Signed out"}
                  </Badge>
                ),
                hint: "Whether a session is open. It may still expire on its own.",
              },
              {
                label: "Trusted devices",
                value: <span className="tabular-nums">{admin.trustedDeviceCount}</span>,
                hint: isSuper
                  ? "Super admins are not device-bound."
                  : "Staff can use one trusted browser at a time.",
              },
              {
                label: "Password",
                value: admin.mustResetPassword ? "Temporary password not yet replaced" : "Set",
              },
            ]}
          />
        </DetailSection>

        <DetailSection title="Access" className="xl:col-span-2">
          <DetailList
            items={[
              {
                label: "Role",
                value: (
                  <Badge tone={isSuper ? "accent" : "neutral"}>{ROLE_INFO[admin.role].label}</Badge>
                ),
              },
              {
                label: "Permission set",
                value: customRole ? (
                  <Link href="/administrators/roles" className="hover:underline">
                    {customRole.name}
                  </Link>
                ) : admin.customRoleId ? (
                  "Custom role"
                ) : (
                  "Chosen individually"
                ),
                hideWhenEmpty: isSuper,
              },
              {
                label: "Permissions",
                value: isSuper ? (
                  "All permissions"
                ) : permissions.length === 0 ? null : (
                  <ul className="flex flex-wrap gap-1">
                    {permissions.map((p) => (
                      <li key={p}>
                        <Badge
                          tone={
                            PERMISSION_INFO[p].risk === "critical"
                              ? "danger"
                              : PERMISSION_INFO[p].risk === "elevated"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {PERMISSION_INFO[p].label}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]}
          />
        </DetailSection>
      </div>

      <section className="grid gap-2" aria-label="Actions by this administrator">
        <h2 className="text-sm font-medium">Actions by this administrator</h2>
        <AuditTable
          tableId="admin-audit"
          page={auditPage}
          pageSize={auditSize}
          search=""
          action={null}
          adminId={adminId}
          onPageChange={setAuditPage}
          onPageSizeChange={(size) => {
            setAuditSize(size);
            setAuditPage(1);
          }}
          emptyDescription="This administrator has no recorded actions yet."
        />
      </section>

      {editing && (
        <EditAccessDialog
          admin={admin}
          onClose={() => {
            setEditing(false);
          }}
          onSaved={refresh}
        />
      )}

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={copy?.title ?? ""}
        target={
          <span className="grid">
            <span className="font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">
              {admin.email} · {ROLE_INFO[admin.role].label}
            </span>
          </span>
        }
        impact={copy?.impact ?? ""}
        confirmLabel={copy?.confirm ?? ""}
        tone={copy?.tone}
        reason={pending === "suspend" ? { required: true, minLength: 10 } : undefined}
        stepUp={{ twoFactor: true }}
        confirmPhrase={pending === "remove" ? admin.email : undefined}
        onConfirm={({ reason, twoFACode }) =>
          pending
            ? mutate.mutateAsync({ action: pending, reason, twoFACode: twoFACode ?? "" })
            : Promise.resolve()
        }
      />
    </div>
  );
}

function EditAccessDialog({
  admin,
  onClose,
  onSaved,
}: {
  admin: AdminAccount;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [access, setAccess] = useState<AccessValue>({
    role: isAdminRole(admin.role) ? admin.role : "admin",
    permissions: admin.permissions.filter(
      (p): p is AdminPermission =>
        p in PERMISSION_INFO && PERMISSION_INFO[p as AdminPermission].grantable,
    ),
    customRoleId: admin.customRoleId,
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => updateAdministratorAccess(admin.id, { ...access, twoFACode: code.trim() }),
  });

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    try {
      await save.mutateAsync();
      toast.success("Access updated");
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
            <DialogTitle>Edit access</DialogTitle>
            <DialogDescription>
              Changes take effect on their next request and are recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <AccessForm value={access} onChange={setAccess} />
          <div className="grid max-w-56 gap-1.5">
            <Label htmlFor="edit-access-2fa">Your authenticator code</Label>
            <Input
              id="edit-access-2fa"
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
              Save access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
