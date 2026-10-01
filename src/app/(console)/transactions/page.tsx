import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { TransactionsView } from "@/features/transactions/transactions-view";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <AccessGuard rule={{ permission: "transactions.view" }}>
      <PageHeader
        title="Transactions"
        description="Every trade, transfer, deposit, withdrawal and bill payment on the unified ledger."
      />
      <TransactionsView />
    </AccessGuard>
  );
}
