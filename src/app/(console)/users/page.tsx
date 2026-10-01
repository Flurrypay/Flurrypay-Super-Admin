import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { UsersView } from "@/features/users/users-view";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <AccessGuard rule={{ permission: "users.view" }}>
      <PageHeader
        title="Users"
        description="Customer accounts, restrictions and verification level."
      />
      <UsersView />
    </AccessGuard>
  );
}
