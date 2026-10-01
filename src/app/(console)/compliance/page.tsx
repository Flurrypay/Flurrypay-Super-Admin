import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { ComplianceView } from "@/features/compliance/compliance-view";

export const metadata: Metadata = { title: "Compliance" };

export default function CompliancePage() {
  return (
    <AccessGuard rule={{ permission: "compliance.review" }}>
      <PageHeader
        title="Compliance"
        description="Transaction-monitoring alerts, customer risk profiles and the suspicious activity report register."
      />
      <ComplianceView />
    </AccessGuard>
  );
}
