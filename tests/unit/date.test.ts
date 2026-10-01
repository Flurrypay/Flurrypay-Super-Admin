import { describe, expect, it } from "vitest";

import { addDaysToDateString, endOfZonedDay, startOfZonedDay, toZonedDateString } from "@/lib/date";

describe("zoned day boundaries", () => {
  it("starts a Lagos (WAT, UTC+1) day at 23:00 UTC the previous day", () => {
    expect(startOfZonedDay("2026-09-22", "Africa/Lagos").toISOString()).toBe(
      "2026-09-21T23:00:00.000Z",
    );
    expect(endOfZonedDay("2026-09-22", "Africa/Lagos").toISOString()).toBe(
      "2026-09-22T22:59:59.999Z",
    );
  });

  it("follows daylight saving in zones that observe it", () => {
    expect(startOfZonedDay("2026-07-01", "Europe/London").toISOString()).toBe(
      "2026-06-30T23:00:00.000Z",
    );
    expect(startOfZonedDay("2026-01-15", "Europe/London").toISOString()).toBe(
      "2026-01-15T00:00:00.000Z",
    );
  });

  it("reports the zone-local calendar date of an instant", () => {
    expect(toZonedDateString(new Date("2026-09-21T23:30:00Z"), "Africa/Lagos")).toBe("2026-09-22");
  });

  it("adds days across month boundaries", () => {
    expect(addDaysToDateString("2026-01-31", 1)).toBe("2026-02-01");
  });
});
