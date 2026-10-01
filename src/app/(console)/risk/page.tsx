import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { RiskView } from "@/features/risk/risk-view";

export const metadata: Metadata = { title: "Risk" };

export default function RiskPage() {
  return (
    <AccessGuard rule={{ permission: "compliance.review" }}>
      <PageHeader
        title="Risk & fraud"
        description="Investigate cases opened by risk monitoring: why activity was flagged, what the account is connected to, and what has been done about it."
      />
      <RiskView />
    </AccessGuard>
  );
}
