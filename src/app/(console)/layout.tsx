import { type ReactNode, Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/features/auth/components/auth-gate";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
