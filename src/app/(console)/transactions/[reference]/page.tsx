import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { TransactionPage } from "@/features/transactions/transaction-page";

export const metadata: Metadata = { title: "Transaction" };

export default async function Page({ params }: PageProps<"/transactions/[reference]">) {
  const { reference } = await params;
  return (
    <AccessGuard rule={{ permission: "transactions.view" }}>
      <TransactionPage reference={decodeURIComponent(reference)} />
    </AccessGuard>
  );
}
