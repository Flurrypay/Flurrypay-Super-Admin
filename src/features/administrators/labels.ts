import { queryOptions } from "@tanstack/react-query";
import { CircleCheckIcon, ClockAlertIcon, KeyRoundIcon, PauseCircleIcon } from "lucide-react";

import type { StatusMap } from "@/components/status/status-badge";

import { type AdminAccount, fetchRoles, invitationState } from "./api";

export type AdminState = "active" | "suspended" | "setup" | "expired";

export const ADMIN_STATE: StatusMap<AdminState> = {
  active: { label: "Active", tone: "success", icon: CircleCheckIcon, description: "Can sign in." },
  suspended: {
    label: "Suspended",
    tone: "danger",
    icon: PauseCircleIcon,
    description: "Every request is refused until reinstated.",
  },
  setup: {
    label: "Invited",
    tone: "neutral",
    icon: KeyRoundIcon,
    description: "Has not yet signed in and replaced the temporary password.",
  },
  expired: {
    label: "Invitation expired",
    tone: "warning",
    icon: ClockAlertIcon,
    description: "The temporary password no longer works. Resend the invitation or revoke it.",
  },
};

export function adminState(admin: AdminAccount, now?: number): AdminState {
  if (admin.isSuspended) return "suspended";
  const invitation = invitationState(admin, now);
  if (invitation === "expired") return "expired";
  if (invitation === "pending") return "setup";
  return "active";
}

export const administratorsQueryKey = ["administrators"] as const;

export const rolesQuery = queryOptions({
  queryKey: ["admin-roles"],
  queryFn: ({ signal }) => fetchRoles(signal),
  staleTime: 60_000,
});
