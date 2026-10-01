// @vitest-environment node
import { describe, expect, it } from "vitest";

import { notificationSchema, notificationTarget } from "@/features/notifications/api";

function notification(overrides: Record<string, unknown> = {}) {
  return notificationSchema.parse({
    id: "n1",
    title: "Something happened",
    body: "Details",
    read: false,
    createdAt: "2026-09-23T12:00:00Z",
    ...overrides,
  });
}

describe("notification deep links", () => {
  it("routes each entity to the screen that can act on it", () => {
    expect(notificationTarget(notification({ entityType: "user", entityId: "u1" }))).toBe(
      "/users/u1",
    );
    expect(notificationTarget(notification({ entityType: "transaction", entityId: "FP-1" }))).toBe(
      "/transactions/FP-1",
    );
    expect(notificationTarget(notification({ entityType: "case", entityId: "c1" }))).toBe(
      "/risk?tab=cases&case=c1",
    );
    expect(notificationTarget(notification({ entityType: "alert", entityId: "a1" }))).toBe(
      "/compliance?tab=alerts&alert=a1",
    );
  });

  it("sends a KYC alert to the customer's own KYC tab, not the queue", () => {
    expect(notificationTarget(notification({ entityType: "kyc", entityId: "u1" }))).toBe(
      "/users/u1?tab=kyc",
    );
  });

  it("keeps the appeal/contact prefix the support inbox needs to tell the tables apart", () => {
    expect(
      notificationTarget(notification({ entityType: "supportMessage", entityId: "appeal:abc" })),
    ).toBe("/support?tab=inbox&message=appeal%3Aabc");
  });

  it("routes screens that have no id, and refuses entities that need one", () => {
    expect(notificationTarget(notification({ entityType: "treasury" }))).toBe("/treasury");
    expect(notificationTarget(notification({ entityType: "stranded" }))).toBe(
      "/operations/stranded",
    );
    expect(notificationTarget(notification({ entityType: "user" }))).toBeNull();
  });

  it("leaves a notification unlinked when it points at nothing", () => {
    expect(notificationTarget(notification())).toBeNull();
  });

  it("falls back to an explicit console path when no entity is recorded", () => {
    expect(notificationTarget(notification({ link: "/operations/stranded?age=24" }))).toBe(
      "/operations/stranded?age=24",
    );
  });

  it("prefers the entity over the link, since only the entity produces a route we built", () => {
    expect(
      notificationTarget(notification({ entityType: "user", entityId: "u1", link: "/treasury" })),
    ).toBe("/users/u1");
  });

  // The important ones. Notification rows are written by a dozen call sites
  // including webhook handlers that process third-party payloads, so `link` is
  // never rendered into an href without passing this.
  it.each([
    ["an absolute URL", "https://evil.test/steal"],
    ["a protocol-relative URL", "//evil.test/steal"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,<script>alert(1)</script>"],
    ["a slash-prefixed scheme", "/javascript:alert(1)"],
    ["a backslash-smuggled host", "/\\evil.test"],
    ["a relative path with no leading slash", "users/u1"],
    ["a newline-smuggled path", "/users\nhttps://evil.test"],
    ["an empty string", ""],
  ])("refuses %s as a notification link", (_label, link) => {
    expect(notificationTarget(notification({ link }))).toBeNull();
  });

  it("drops an entity type it has never heard of rather than guessing a route", () => {
    const parsed = notification({ entityType: "something_new", entityId: "x1" });
    expect(parsed.entityType).toBeNull();
    expect(notificationTarget(parsed)).toBeNull();
  });
});
