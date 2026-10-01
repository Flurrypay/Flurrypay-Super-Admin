"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { QueryProvider } from "./query-provider";

/** Application-wide client providers. Keep this list short; scope providers to subtrees where possible. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <QueryProvider>
        <TooltipPrimitive.Provider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" closeButton toastOptions={{ className: "text-sm" }} />
        </TooltipPrimitive.Provider>
      </QueryProvider>
    </NuqsAdapter>
  );
}
