import type { ReactNode } from "react";

interface StatusScreenProps {
  title: string;
  description: string;
  /** Opaque reference (e.g. an error digest) users can quote to support. */
  reference?: string;
  children?: ReactNode;
}

/** Full-page, centred message for framework-level states: errors and not-found. */
export function StatusScreen({ title, description, reference, children }: StatusScreenProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {reference && (
          <p className="font-mono text-xs text-muted-foreground">Reference: {reference}</p>
        )}
        {children && <div className="mt-2 flex gap-2">{children}</div>}
      </div>
    </main>
  );
}
