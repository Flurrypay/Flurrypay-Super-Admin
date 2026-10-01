import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { KycQueueView } from "@/features/kyc/kyc-queue-view";

export const metadata: Metadata = { title: "KYC review" };

export default function KycPage() {
  return (
    <AccessGuard rule={{ permission: "kyc.review" }}>
      <PageHeader
        title="KYC review"
        description="Identity verification decisions. Approving a level raises the customer's withdrawal limit."
      />
      <KycQueueView />
    </AccessGuard>
  );
}
