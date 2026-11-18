import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { ReversalsView } from "@/features/operations/reversals-view";

export const metadata: Metadata = { title: "Reversals" };

export default function ReversalsPage() {
  return (
    <AccessGuard rule={{ anyPermission: ["transactions.reverse", "transactions.view"] }}>
      <PageHeader
        title="Reversals"
        description="Failed transactions that may not have returned the customer's money, for review and reversal."
      />
      <ReversalsView />
    </AccessGuard>
  );
}
