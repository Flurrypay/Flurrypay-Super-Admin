import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";

import { Identifier } from "@/components/format/identifier";
import { Button } from "@/components/ui/button";
import { toAppError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  error: unknown;
  /** What failed, e.g. "transactions". */
  subject: string;
  onRetry?: () => void;
  className?: string;
}

/** User-safe failure message with the request ID support needs to trace it. */
export function ErrorState({ error, subject, onRetry, className }: ErrorStateProps) {
  const appError = toAppError(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-md border border-destructive/25 bg-destructive/6 text-destructive">
        <TriangleAlertIcon className="size-4" aria-hidden />
      </span>
      <p className="text-sm font-medium">Unable to load {subject}.</p>
      <p className="max-w-sm text-sm text-muted-foreground">{appError.userMessage}</p>
      {appError.requestId && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Reference <Identifier value={appError.requestId} label="request reference" />
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RotateCwIcon aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}
