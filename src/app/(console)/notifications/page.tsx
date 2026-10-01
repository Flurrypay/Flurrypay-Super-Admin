import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { NotificationsView } from "@/features/notifications/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

/**
 * No AccessGuard: every signed-in administrator has a notification bell, so
 * every one of them can open the list behind it. What they are shown is still
 * decided by the API.
 */
export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything the system has raised for administrators, newest first."
      />
      <NotificationsView />
    </>
  );
}
