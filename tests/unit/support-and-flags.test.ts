// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type ChatMessage,
  chatMessageSchema,
  isFromAdmin,
  parseSupportKey,
  supportKey,
  supportMessageSchema,
} from "@/features/support/api";
import { SUPPORT_STATUS_OPTIONS } from "@/features/support/labels";
import { isFlagged, transactionSchema } from "@/features/transactions/api";
import { flagReasonLabel, flagSeverityTone } from "@/features/transactions/labels";

function message(overrides: Record<string, unknown> = {}) {
  return supportMessageSchema.parse({
    id: "m1",
    type: "appeal",
    name: "Ada O",
    email: "ada@example.test",
    message: "Please help",
    status: "pending",
    readByAdmin: false,
    submittedAt: "2026-09-23T12:00:00Z",
    ...overrides,
  });
}

function transaction(overrides: Record<string, unknown> = {}) {
  return transactionSchema.parse({
    id: "t1",
    userId: "u1",
    transactionType: "FIAT_WITHDRAWAL",
    status: "COMPLETED",
    ...overrides,
  });
}

describe("support thread identity", () => {
  // The inbox merges two tables whose ids are only unique within themselves, so
  // a bare id is not a usable row key or URL parameter here.
  it("round-trips the (type, id) pair", () => {
    const key = supportKey(message({ type: "contact", id: "abc" }));
    expect(key).toBe("contact:abc");
    expect(parseSupportKey(key)).toEqual({ type: "contact", id: "abc" });
  });

  it("keeps ids that contain a colon intact", () => {
    expect(parseSupportKey("appeal:a:b:c")).toEqual({ type: "appeal", id: "a:b:c" });
  });

  it.each([
    ["no separator", "appeal"],
    ["an unknown table", "ticket:1"],
    ["an empty id", "appeal:"],
    ["a leading separator", ":1"],
    ["null", null],
  ])("rejects %s", (_label, key) => {
    expect(parseSupportKey(key)).toBeNull();
  });
});

describe("support statuses", () => {
  // Offering "approved" on a contact message would record a decision the word
  // does not describe; offering "resolved" on an appeal hides whether the
  // account was actually given back.
  it("offers each type only the outcomes that describe it", () => {
    expect(SUPPORT_STATUS_OPTIONS.appeal).toContain("approved");
    expect(SUPPORT_STATUS_OPTIONS.appeal).not.toContain("resolved");
    expect(SUPPORT_STATUS_OPTIONS.contact).toContain("resolved");
    expect(SUPPORT_STATUS_OPTIONS.contact).not.toContain("approved");
  });

  it("keeps an unrecognised status readable instead of dropping the row", () => {
    expect(message({ status: "escalated_to_legal" }).status).toBe("escalated_to_legal");
  });
});

describe("chat authorship", () => {
  const customerMessage: ChatMessage = chatMessageSchema.parse({
    id: "c1",
    senderId: "u1",
    message: "hello",
    createdAt: "2026-09-23T12:00:00Z",
  });

  it("reads a message from anyone other than the customer as the admin side", () => {
    expect(isFromAdmin(customerMessage, "u1")).toBe(false);
    expect(isFromAdmin({ ...customerMessage, senderId: "admin-1" }, "u1")).toBe(true);
  });

  it("does not claim authorship it cannot establish", () => {
    // With no customer id there is nothing to compare against, and guessing
    // "admin" would put the company's name on the customer's own words.
    expect(isFromAdmin({ ...customerMessage, senderId: "admin-1" }, null)).toBe(false);
  });
});

describe("transaction flags", () => {
  it("counts only an open flag as flagged", () => {
    expect(isFlagged(transaction())).toBe(false);
    expect(isFlagged(transaction({ flaggedAt: "2026-09-23T12:00:00Z" }))).toBe(true);
  });

  // A cleared flag stays on the row as history. Treating "has a flaggedAt" as
  // "is flagged" is how finished reviews keep reappearing in the queue.
  it("stops counting a flag once it has been cleared", () => {
    const cleared = transaction({
      flaggedAt: "2026-09-23T12:00:00Z",
      flagClearedAt: "2026-09-25T09:00:00Z",
      flagResolution: "Invoice produced, no further action.",
    });
    expect(isFlagged(cleared)).toBe(false);
    expect(cleared.flagResolution).toBe("Invoice produced, no further action.");
  });

  it("humanises a flag reason this build has not heard of", () => {
    expect(flagReasonLabel("SUSPECTED_FRAUD")).toBe("Suspected fraud");
    expect(flagReasonLabel("SOME_NEW_REASON")).toBe("Some new reason");
    expect(flagReasonLabel(null)).toBe("Flagged");
  });

  it("tones an unknown severity as a warning rather than as nothing", () => {
    expect(flagSeverityTone("CRITICAL")).toBe("danger");
    expect(flagSeverityTone("LOW")).toBe("neutral");
    expect(flagSeverityTone("EXTREME")).toBe("warning");
    expect(flagSeverityTone(null)).toBe("warning");
  });

  it("never lets a flag reach a customer-facing status", () => {
    // The flag is internal. If it ever started changing `status`, a completed
    // payment would stop reading as completed everywhere else in the console.
    const flagged = transaction({ flaggedAt: "2026-09-23T12:00:00Z", flagSeverity: "CRITICAL" });
    expect(flagged.status).toBe("COMPLETED");
  });
});
