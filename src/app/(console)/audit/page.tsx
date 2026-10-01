import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { PageHeader } from "@/components/layout/page-header";
import { AuditLogView } from "@/features/audit/audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <AccessGuard rule={{ permission: "auditLogs.view" }}>
      <PageHeader
        title="Audit log"
        description="Every administrator action recorded by the API: who, what, when, from where, and the details captured."
      />
      <AuditLogView />
    </AccessGuard>
  );
}
