import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MetricProps {
  label: string;
  value: number | undefined;
  /** Rendered instead of the formatted count (e.g. an amount). `value` still drives `attention`. */
  display?: ReactNode;
  icon: LucideIcon;
  /** How the number is calculated. */
  definition: string;
  href?: Route;
  /** Highlight when the value is above zero (work waiting, failures). */
  attention?: boolean;
  isPending: boolean;
  isError: boolean;
}

/** One defensible number with its definition. Links to the filtered list behind it. */
export function Metric({
  label,
  value,
  display,
  icon: Icon,
  definition,
  href,
  attention = false,
  isPending,
  isError,
}: MetricProps) {
  const flagged = attention && (value ?? 0) > 0;
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        <Icon
          className={cn("size-4", flagged ? "text-warning" : "text-muted-foreground")}
          aria-hidden
        />
      </span>
      {isPending ? (
        <Skeleton className="h-7 w-16" />
      ) : isError ? (
        <span className="text-sm text-muted-foreground">Unavailable</span>
      ) : (
        <span className={cn("text-2xl font-semibold tabular-nums", flagged && "text-warning")}>
          {display ?? formatCount(value ?? 0)}
        </span>
      )}
    </>
  );
  const className = "grid gap-1.5 rounded-md border bg-card px-4 py-3 transition-colors";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className={cn(className, "hover:border-input hover:bg-muted/40")}>
            {body}
          </Link>
        ) : (
          <div tabIndex={0} className={className}>
            {body}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{definition}</TooltipContent>
    </Tooltip>
  );
}
