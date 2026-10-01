"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatRelative, getTimeZoneLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

interface DateTimeProps {
  value: string | Date | null | undefined;
  /** "datetime" (default), "date", or "relative". */
  format?: "datetime" | "date" | "relative";
  className?: string;
}

function toDate(value: DateTimeProps["value"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Timestamp in the operations time zone (WAT). The tooltip shows the
 * unambiguous UTC ISO value, which is what support and logs use.
 */
export function DateTime({ value, format = "datetime", className }: DateTimeProps) {
  const date = toDate(value);
  if (!date) return <span className="text-muted-foreground">—</span>;

  const label =
    format === "relative"
      ? formatRelative(date)
      : format === "date"
        ? formatDateTime(date, { dateStyle: "medium" })
        : formatDateTime(date, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={date.toISOString()}
          className={cn("whitespace-nowrap tabular-nums", className)}
        >
          {label}
        </time>
      </TooltipTrigger>
      <TooltipContent>
        <span className="block">
          {formatDateTime(date, { dateStyle: "full", timeStyle: "medium" })}{" "}
          {getTimeZoneLabel(date)}
        </span>
        <span className="block font-mono opacity-80">{date.toISOString()}</span>
      </TooltipContent>
    </Tooltip>
  );
}
