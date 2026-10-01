import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { SupportView } from "@/features/support/support-view";

export const metadata: Metadata = { title: "Support" };

/**
 * Guarded on `users.view` rather than `support.reply`, because reading the queue
 * and answering it are different jobs: a lead who triages and assigns needs to
 * see every thread without being able to email customers in the company's name.
 * The reply box itself checks `support.reply`, and the API enforces both.
 */
export default function SupportPage() {
  return (
    <AccessGuard rule={{ anyPermission: ["support.reply", "users.view"] }}>
      <PageHeader
        title="Support"
        description="Account appeals, contact-us messages and live in-app chat with customers."
      />
      <SupportView />
    </AccessGuard>
  );
}
