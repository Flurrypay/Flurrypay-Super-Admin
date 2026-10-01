import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PREVIEW_MODE } from "@/config/preview";
import { siteConfig } from "@/config/site";
import { LoginFlow } from "@/features/auth/components/login-flow";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // Preview mode has no sign-in.
  if (PREVIEW_MODE) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
          >
            F
          </span>
          <span className="text-base font-semibold tracking-tight">{siteConfig.name}</span>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-xs">
          <Suspense>
            <LoginFlow />
          </Suspense>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Access is monitored and recorded. Unauthorised use is prohibited.
        </p>
      </div>
    </main>
  );
}
