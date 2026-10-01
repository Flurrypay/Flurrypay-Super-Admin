import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { AdministratorDetailPage } from "@/features/administrators/administrator-detail-page";

export const metadata: Metadata = { title: "Administrator" };

export default async function Page({ params }: PageProps<"/administrators/[adminId]">) {
  const { adminId } = await params;
  return (
    <AccessGuard rule={{ superAdmin: true }}>
      <AdministratorDetailPage adminId={adminId} />
    </AccessGuard>
  );
}
