import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { TreasuryView } from "@/features/treasury/treasury-view";

export const metadata: Metadata = { title: "Treasury" };

export default function TreasuryPage() {
  return (
    <AccessGuard rule={{ permission: "treasury.view" }}>
      <PageHeader
        title="Treasury"
        description="Settlement liquidity against customer balances, payout accounts and company earnings."
      />
      <TreasuryView />
    </AccessGuard>
  );
}
