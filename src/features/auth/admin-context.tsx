"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { CurrentAdmin } from "./api";
import {
  type AccessRule,
  type AdminPermission,
  canAccess,
  hasPermission,
  isSuperAdmin,
} from "./permissions";

const AdminContext = createContext<CurrentAdmin | null>(null);

export function AdminProvider({ admin, children }: { admin: CurrentAdmin; children: ReactNode }) {
  return <AdminContext value={admin}>{children}</AdminContext>;
}

/** The signed-in administrator. Only available inside the authenticated console. */
export function useAdmin(): CurrentAdmin {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error("useAdmin must be used inside the authenticated console");
  return admin;
}

export function useCan(rule: AccessRule): boolean {
  return canAccess(useAdmin(), rule);
}

export function useHasPermission(permission: AdminPermission): boolean {
  return hasPermission(useAdmin(), permission);
}

export function useIsSuperAdmin(): boolean {
  return isSuperAdmin(useAdmin());
}
