import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { RolesView } from "@/features/administrators/roles-view";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return (
    <AccessGuard rule={{ superAdmin: true }}>
      <PageHeader
        eyebrow={
          <Breadcrumbs
            items={[{ label: "Administrators", href: "/administrators" }, { label: "Roles" }]}
          />
        }
        title="Roles"
        description="Reusable permission sets for staff administrators."
      />
      <RolesView />
    </AccessGuard>
  );
}
