import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsView } from "@/features/reports/reports-view";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <AccessGuard rule={{ anyPermission: ["transactions.view", "users.view"] }}>
      <PageHeader
        title="Reports"
        description="Transaction outcomes and customer growth over a period, computed by the database."
      />
      <ReportsView />
    </AccessGuard>
  );
}
