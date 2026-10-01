import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SecurityView } from "@/features/security/security-view";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        title="Security"
        description="Your two-factor authentication, transaction PIN and session."
      />
      <SecurityView />
    </>
  );
}
