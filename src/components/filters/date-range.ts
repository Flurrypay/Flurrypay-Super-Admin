import { localeConfig } from "@/config/locale";
import {
  addDaysToDateString,
  endOfZonedDay,
  formatDateTime,
  startOfZonedDay,
  toZonedDateString,
} from "@/lib/date";

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "this-month",
  "last-month",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
};

/** Stored in the URL as `range` plus, for custom ranges, zone-local `from`/`to` dates (YYYY-MM-DD). */
export interface DateRangeValue {
  range: DatePreset | "custom" | null;
  from: string | null;
  to: string | null;
}

export interface ResolvedRange {
  from: Date;
  to: Date;
}

/**
 * Resolves a range to instants using the operations time zone, so "Today"
 * means midnight WAT onwards, not midnight UTC. Presets resolve against `now`.
 */
export function resolveDateRange(
  value: DateRangeValue,
  now: Date = new Date(),
  timeZone: string = localeConfig.defaultTimeZone,
): ResolvedRange | null {
  const today = toZonedDateString(now, timeZone);
  const dayRange = (fromDay: string, toDay: string): ResolvedRange => ({
    from: startOfZonedDay(fromDay, timeZone),
    to: toDay === today ? now : endOfZonedDay(toDay, timeZone),
  });

  switch (value.range) {
    case "today":
      return dayRange(today, today);
    case "yesterday": {
      const day = addDaysToDateString(today, -1);
      return dayRange(day, day);
    }
    case "7d":
      return dayRange(addDaysToDateString(today, -6), today);
    case "30d":
      return dayRange(addDaysToDateString(today, -29), today);
    case "this-month":
      return dayRange(`${today.slice(0, 8)}01`, today);
    case "last-month": {
      const firstOfThis = `${today.slice(0, 8)}01`;
      const lastOfPrevious = addDaysToDateString(firstOfThis, -1);
      return dayRange(`${lastOfPrevious.slice(0, 8)}01`, lastOfPrevious);
    }
    case "custom": {
      if (!value.from || !value.to || value.from > value.to) return null;
      return dayRange(value.from, value.to);
    }
    default:
      return null;
  }
}

export function describeDateRange(value: DateRangeValue): string | null {
  if (!value.range) return null;
  if (value.range !== "custom") return DATE_PRESET_LABELS[value.range];
  if (!value.from || !value.to) return null;
  const format = (day: string) =>
    formatDateTime(new Date(`${day}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  return value.from === value.to
    ? format(value.from)
    : `${format(value.from)} – ${format(value.to)}`;
}
