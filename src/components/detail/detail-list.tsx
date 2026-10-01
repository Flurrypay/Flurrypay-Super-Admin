import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DetailItem {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Omit the row entirely when the value is absent. */
  hideWhenEmpty?: boolean;
}

function isEmpty(value: ReactNode): boolean {
  return value === null || value === undefined || value === "" || value === false;
}

/** Label/value pairs for detail views; absent values show an em dash. */
export function DetailList({
  items,
  columns = 1,
  className,
}: {
  items: DetailItem[];
  columns?: 1 | 2;
  className?: string;
}) {
  const visible = items.filter((item) => !(item.hideWhenEmpty && isEmpty(item.value)));
  return (
    <dl
      className={cn("grid gap-x-6 gap-y-2.5 text-sm", columns === 2 && "sm:grid-cols-2", className)}
    >
      {visible.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[minmax(8rem,40%)_1fr] items-baseline gap-3"
        >
          <dt className="flex items-center gap-1 text-muted-foreground">
            {item.label}
            {item.hint && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground/70 hover:text-foreground">
                    <InfoIcon className="size-3" aria-hidden />
                    <span className="sr-only">About {item.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{item.hint}</TooltipContent>
              </Tooltip>
            )}
          </dt>
          <dd className="min-w-0 break-words">
            {isEmpty(item.value) ? <span className="text-muted-foreground">—</span> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border bg-card", className)} aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
