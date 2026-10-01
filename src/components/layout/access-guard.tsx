"use client";

import { LockIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { useAdmin } from "@/features/auth/admin-context";
import { type AccessRule, canAccess } from "@/features/auth/permissions";

/**
 * Renders children only if the admin's role allows the screen, so deep links
 * don't fetch data the admin isn't meant to see. This is a courtesy, not
 * enforcement: the API must authorise every request (docs/03-gaps-and-security.md S1).
 */
export function AccessGuard({ rule, children }: { rule: AccessRule; children: ReactNode }) {
  const admin = useAdmin();
  if (canAccess(admin, rule)) return children;
  return (
    <EmptyState
      icon={LockIcon}
      title="You don't have access to this section"
      description={
        rule !== "authenticated" && "superAdmin" in rule
          ? "Only super admins can open this section."
          : "Your role doesn't include the permission this section needs. Ask a super admin if you need it."
      }
      className="py-24"
    />
  );
}
