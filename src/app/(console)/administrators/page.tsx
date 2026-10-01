import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { AdministratorsView } from "@/features/administrators/administrators-view";

export const metadata: Metadata = { title: "Administrators" };

export default function AdministratorsPage() {
  return (
    <AccessGuard rule={{ superAdmin: true }}>
      <PageHeader
        title="Administrators"
        description="Who can access this console, with which role and permissions."
      />
      <AdministratorsView />
    </AccessGuard>
  );
}
