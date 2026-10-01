import { isValid, parseISO } from "date-fns";

import { localeConfig } from "@/config/locale";

/**
 * Timestamps cross boundaries (API, URL, storage) as UTC ISO-8601 strings.
 * Local time zones are applied only at the moment of display, and always explicitly.
 */

/** Parses an ISO-8601 string, returning null for anything invalid. Strings without an offset are rejected. */
export function parseIsoTimestamp(value: string): Date | null {
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

/** Serialises to a UTC ISO-8601 string, e.g. `2026-01-31T09:15:00.000Z`. */
export function toIsoUtc(date: Date): string {
  return date.toISOString();
}

interface FormatDateTimeOptions extends Intl.DateTimeFormatOptions {
  locale?: string;
}

/** Formats for display in an explicit time zone (defaults to the configured display zone, not the host's). */
export function formatDateTime(
  date: Date,
  {
    locale = localeConfig.defaultLocale,
    timeZone = localeConfig.defaultTimeZone,
    ...options
  }: FormatDateTimeOptions = {},
): string {
  const formatOptions: Intl.DateTimeFormatOptions =
    Object.keys(options).length > 0 ? options : { dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat(locale, { ...formatOptions, timeZone }).format(date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** "12 seconds ago", "in 3 minutes" — relative to `now`. */
export function formatRelative(
  date: Date,
  now: Date = new Date(),
  locale: string = localeConfig.defaultLocale,
): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(0, "second");
}

/** Short zone label for the display time zone, e.g. "WAT". */
export function getTimeZoneLabel(
  date: Date = new Date(),
  timeZone: string = localeConfig.defaultTimeZone,
): string {
  const part = new Intl.DateTimeFormat("en-NG", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function toZonedDateString(
  date: Date,
  timeZone: string = localeConfig.defaultTimeZone,
): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** UTC offset ("+01:00") of a zone at a given instant, via Intl (handles DST zones too). */
function zoneOffset(date: Date, timeZone: string): string {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
  return match ? `${match[1]}:${match[2] ?? "00"}` : "+00:00";
}

/** The instant a zone-local calendar day starts, e.g. "2026-09-22" in Lagos → 2026-09-21T23:00:00Z. */
export function startOfZonedDay(
  day: string,
  timeZone: string = localeConfig.defaultTimeZone,
): Date {
  const noon = new Date(`${day}T12:00:00Z`);
  return new Date(`${day}T00:00:00${zoneOffset(noon, timeZone)}`);
}

/** The last millisecond of a zone-local calendar day. */
export function endOfZonedDay(day: string, timeZone: string = localeConfig.defaultTimeZone): Date {
  return new Date(startOfZonedDay(addDaysToDateString(day, 1), timeZone).getTime() - 1);
}

/** Calendar arithmetic on YYYY-MM-DD strings (independent of any time zone). */
export function addDaysToDateString(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
