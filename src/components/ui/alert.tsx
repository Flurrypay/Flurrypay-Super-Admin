import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "grid grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-0.5 rounded-md border px-3 py-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted/50 [&>svg]:text-muted-foreground",
        info: "border-info/25 bg-info/6 [&>svg]:text-info",
        warning: "border-warning/30 bg-warning/8 [&>svg]:text-warning",
        danger: "border-destructive/25 bg-destructive/6 [&>svg]:text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Alert({
  className,
  tone,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="note" className={cn(alertVariants({ tone }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("col-start-2 font-medium", className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("col-start-2 text-muted-foreground", className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
