import Link from "next/link";

import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusScreen title="Page not found" description="The page you requested does not exist.">
      <Button asChild variant="outline">
        <Link href="/">Go to home</Link>
      </Button>
    </StatusScreen>
  );
}
