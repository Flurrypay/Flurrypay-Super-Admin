import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { StrandedView } from "@/features/operations/stranded-view";

export const metadata: Metadata = { title: "Stranded transfers" };

export default function StrandedPage() {
  return (
    <AccessGuard rule={{ permission: "transactions.view" }}>
      <PageHeader
        title="Stranded transfers"
        description="Transfers where the customer was debited but the money was neither delivered nor returned."
      />
      <StrandedView />
    </AccessGuard>
  );
}
