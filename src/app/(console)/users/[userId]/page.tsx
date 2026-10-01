import type { Metadata } from "next";

import { AccessGuard } from "@/components/layout/access-guard";
import { UserDetailPage } from "@/features/users/user-detail-page";

export const metadata: Metadata = { title: "Customer" };

export default async function Page({ params }: PageProps<"/users/[userId]">) {
  const { userId } = await params;
  return (
    <AccessGuard rule={{ permission: "users.view" }}>
      <UserDetailPage userId={userId} />
    </AccessGuard>
  );
}
