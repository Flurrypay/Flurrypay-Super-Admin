import { z } from "zod";

import { ADMIN_ROLES, type AdminPermission, type AdminRole } from "@/features/auth/permissions";
import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";
import { nullableString, timestamp } from "@/lib/api/schema-helpers";

const base = adminPaths.core;

/** Admin account as listed by `GET /all` (super admin only). Secrets are removed by the API. */
export const adminAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  userName: nullableString,
  firstName: z.string().catch(""),
  lastName: z.string().catch(""),
  role: z.enum(ADMIN_ROLES).catch("admin"),
  permissions: z.array(z.string()).catch([]),
  customRoleId: nullableString,
  isConfirmed: z.boolean().catch(false),
  isSuspended: z.boolean().catch(false),
  suspensionReason: nullableString,
  suspendedAt: timestamp,
  mustResetPassword: z.boolean().catch(false),
  invitationExpiresAt: timestamp,
  invitedById: nullableString,
  hasActivated2FA: z.boolean().catch(false),
  phoneNumber: nullableString,
  trustedDeviceCount: z.number().catch(0),
  hasActiveSession: z.boolean().catch(false),
  lastLoginAt: timestamp,
  createdAt: timestamp,
});
export type AdminAccount = z.output<typeof adminAccountSchema>;

export type InvitationState = "accepted" | "pending" | "expired";

export function invitationState(admin: AdminAccount, now: number = Date.now()): InvitationState {
  if (!admin.mustResetPassword) return "accepted";
  if (admin.invitationExpiresAt && new Date(admin.invitationExpiresAt).getTime() <= now) {
    return "expired";
  }
  return "pending";
}

export function fetchAdministrators(signal?: AbortSignal) {
  return adminApi.get(`${base}/all`, {
    schema: z.object({ admins: z.array(adminAccountSchema) }).transform((v) => v.admins),
    signal,
  });
}

export interface InviteAdminInput {
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  role: AdminRole;
  permissions: AdminPermission[];
  /** Applies a custom role's permissions instead of `permissions`. */
  customRoleId?: string | null;
  twoFACode: string;
}

/** Creates the account with a temporary password emailed by the API (super admin + 2FA). */
export function inviteAdministrator(input: InviteAdminInput) {
  return adminApi.post(`${base}/create`, input, {
    schema: z.object({ message: z.string(), admin: z.object({ id: z.string() }).loose() }),
  });
}

export function updateAdministratorAccess(
  id: string,
  input: {
    role: AdminRole;
    permissions: AdminPermission[];
    /** A role ID applies that role's permissions; null detaches any role. */
    customRoleId: string | null;
    twoFACode: string;
  },
) {
  return adminApi.put(`${base}/${encodeURIComponent(id)}/permissions`, input);
}

export function suspendAdministrator(id: string, input: { reason: string; twoFACode: string }) {
  return adminApi.post(`${base}/${encodeURIComponent(id)}/suspend`, input);
}

export function unsuspendAdministrator(id: string, input: { twoFACode: string }) {
  return adminApi.post(`${base}/${encodeURIComponent(id)}/unsuspend`, input);
}

/** The 2FA step-up middleware reads `twoFACode` from the DELETE request body. */
export function removeAdministrator(id: string, input: { twoFACode: string }) {
  return adminApi.request("DELETE", `${base}/${encodeURIComponent(id)}`, { body: input });
}

/** Ends the admin's session and forgets their trusted devices (super admin + 2FA). */
export function revokeAdministratorSessions(id: string, input: { twoFACode: string }) {
  return adminApi.post(`${base}/${encodeURIComponent(id)}/revoke-sessions`, input);
}

/** New temporary password and a fresh invitation window, emailed by the API. */
export function resendInvitation(id: string, input: { twoFACode: string }) {
  return adminApi.post(`${base}/${encodeURIComponent(id)}/resend-invitation`, input, {
    schema: z.object({ invitationExpiresAt: timestamp }),
  });
}

/** Deletes an invited account that has not signed in yet. */
export function revokeInvitation(id: string, input: { twoFACode: string }) {
  return adminApi.post(`${base}/${encodeURIComponent(id)}/revoke-invitation`, input);
}

/* ─── Custom roles ───────────────────────────────────────────────────────── */

export const adminRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: nullableString,
  permissions: z.array(z.string()).catch([]),
  assignedCount: z.number().catch(0),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type CustomRole = z.output<typeof adminRoleSchema>;

export interface RoleInput {
  name: string;
  description: string;
  permissions: AdminPermission[];
  twoFACode: string;
}

export function fetchRoles(signal?: AbortSignal) {
  return adminApi.get(`${base}/roles`, {
    schema: z.object({ roles: z.array(adminRoleSchema) }).transform((v) => v.roles),
    signal,
  });
}

export function createRole(input: RoleInput) {
  return adminApi.post(`${base}/roles`, input, { schema: z.object({ role: adminRoleSchema }) });
}

/** Saving re-applies the role's permissions to every staff admin assigned to it. */
export function updateRole(id: string, input: RoleInput) {
  return adminApi.put(`${base}/roles/${encodeURIComponent(id)}`, input, {
    schema: z.object({ role: adminRoleSchema, affectedAdmins: z.number().catch(0) }),
  });
}

/** Refused (409) while any administrator is assigned the role. */
export function deleteRole(id: string, input: { twoFACode: string }) {
  return adminApi.request("DELETE", `${base}/roles/${encodeURIComponent(id)}`, { body: input });
}
