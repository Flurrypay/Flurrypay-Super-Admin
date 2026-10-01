import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { RatesView } from "@/features/rates/rates-view";

export const metadata: Metadata = { title: "Rates" };

export default function RatesPage() {
  return (
    <AccessGuard rule={{ permission: "settings.manage" }}>
      <PageHeader
        title="Rates"
        description="What customers pay and receive: USD rates, trade markups and the swap fee."
      />
      <RatesView />
    </AccessGuard>
  );
}
