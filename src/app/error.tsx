"use client";

import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";
import { getUserMessage } from "@/lib/api/errors";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <StatusScreen
      title="Something went wrong"
      description={getUserMessage(error)}
      reference={error.digest}
    >
      <Button onClick={retry}>Try again</Button>
    </StatusScreen>
  );
}
