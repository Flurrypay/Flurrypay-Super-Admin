"use client";

import { RotateCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelative } from "@/lib/date";
import { cn } from "@/lib/utils";

interface FreshnessProps {
  /** `dataUpdatedAt` from TanStack Query (epoch ms; 0 when never loaded). */
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
}

/** "Updated 12 seconds ago" with a manual refresh. Data is fetched on demand; nothing here is realtime. */
export function Freshness({ updatedAt, isFetching, onRefresh }: FreshnessProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 10_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-live="polite">
        {isFetching
          ? "Refreshing…"
          : updatedAt > 0
            ? `Updated ${formatRelative(new Date(updatedAt), new Date(Math.max(now, updatedAt)))}`
            : null}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onRefresh}
            disabled={isFetching}
          >
            <RotateCwIcon
              className={cn(isFetching && "animate-spin motion-reduce:animate-none")}
              aria-hidden
            />
            <span className="sr-only">Refresh</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>
    </div>
  );
}
