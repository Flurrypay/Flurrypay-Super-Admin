/**
 * Presentation defaults. Values are always stored and transported in
 * locale-neutral forms (UTC ISO-8601 timestamps, integer minor units with an
 * explicit ISO-4217 currency); these settings only affect display.
 */
export const localeConfig = {
  defaultLocale: "en-NG",
  /** Operations run on West Africa Time; timestamps always show their zone. */
  defaultTimeZone: "Africa/Lagos",
} as const;
