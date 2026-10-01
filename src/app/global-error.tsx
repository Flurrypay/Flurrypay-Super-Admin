"use client";

import "./globals.css";

import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

/** Replaces the root layout when it fails, so it renders its own document. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <title>Error</title>
        <StatusScreen
          title="Something went wrong"
          description="An unexpected error occurred. Please try again."
          reference={error.digest}
        >
          <Button onClick={retry}>Try again</Button>
        </StatusScreen>
      </body>
    </html>
  );
}
