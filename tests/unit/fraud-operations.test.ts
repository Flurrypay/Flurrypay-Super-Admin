import { describe, expect, it } from "vitest";

import {
  CASE_EVENT_TYPES,
  CHECKLIST_STATES,
  COUNTERPARTY_TYPES,
  LINK_TYPES,
} from "@/features/risk/investigation-api";
import {
  ATO_BAND_TONE,
  CASE_EVENT_LABEL,
  caseEventMeta,
  CHECKLIST_STATE_LABEL,
  ENGINE_RULE_DESCRIPTION,
  engineRuleDescription,
  LINK_STRENGTH_TONE,
  LINK_TYPE_LABEL,
  WATCHLIST_CATEGORY_LABEL,
  WATCHLIST_ENTITY_LABEL,
  WATCHLIST_STATUS_TONE,
} from "@/features/risk/labels";
import { ENGINE_RULES } from "@/features/risk/monitoring-api";
import {
  WATCHLIST_CATEGORIES,
  WATCHLIST_ENTITY_TYPES,
  WATCHLIST_SEVERITIES,
  WATCHLIST_STATUSES,
} from "@/features/risk/watchlist-api";

/**
 * These guard the seams where the console's vocabulary has to agree with the
 * API's, and the places where a wrong word would mislead an investigator.
 *
 * A mismatch here does not crash: it renders a raw enum key, filters to
 * nothing, or — worst — labels a relationship in a way that implies a finding
 * the data does not support. All three are silent, which is why they are
 * tested rather than left to review.
 */

describe("case event vocabulary", () => {
  it("covers every event type the API can write", () => {
    // api/src/app/models/riskCaseEvent.ts — CaseEventType.
    for (const type of CASE_EVENT_TYPES) {
      expect(CASE_EVENT_LABEL[type], `no label for ${type}`).toBeDefined();
    }
  });

  it("falls back to the raw key rather than rendering undefined", () => {
    const meta = caseEventMeta("SOMETHING_ADDED_LATER");
    expect(meta.label).toBe("SOMETHING_ADDED_LATER");
    expect(meta.icon).toBeDefined();
    expect(meta.tone).toBe("neutral");
  });
});

describe("watchlist vocabulary", () => {
  it("labels every entity type the API accepts", () => {
    // api/src/app/models/riskWatchlistEntry.ts — WatchlistEntityType.
    for (const type of WATCHLIST_ENTITY_TYPES) {
      expect(WATCHLIST_ENTITY_LABEL[type], `no label for ${type}`).toBeDefined();
    }
  });

  it("labels every category the API accepts", () => {
    for (const category of WATCHLIST_CATEGORIES) {
      expect(WATCHLIST_CATEGORY_LABEL[category], `no label for ${category}`).toBeDefined();
    }
  });

  it("tones every status", () => {
    for (const status of WATCHLIST_STATUSES) {
      expect(WATCHLIST_STATUS_TONE[status], `no tone for ${status}`).toBeDefined();
    }
  });

  it("offers the same severities the rest of the risk surface uses", () => {
    expect([...WATCHLIST_SEVERITIES]).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  });

  it("names the counterparty type for what it screens, not only payees", () => {
    // The engine screens a credit's SENDER name through this type. Calling it
    // "beneficiary" would tell an investigator it only covers outbound.
    expect(WATCHLIST_ENTITY_TYPES).toContain("COUNTERPARTY_NAME");
    expect(WATCHLIST_ENTITY_LABEL.COUNTERPARTY_NAME).toBe("Counterparty name");
  });
});

describe("relationship vocabulary", () => {
  it("labels every link type the API can return", () => {
    for (const type of LINK_TYPES) {
      expect(LINK_TYPE_LABEL[type], `no label for ${type}`).toBeDefined();
    }
  });

  /**
   * The substantive one. A shared device means those accounts are connected,
   * not that anything is wrong — households share phones and carriers share
   * IP addresses. Rendering any link strength in the danger tone would present
   * a relationship as a finding, at a glance, to somebody making a decision
   * about a customer's money.
   */
  it("never renders a relationship in the danger tone", () => {
    expect(Object.values(LINK_STRENGTH_TONE)).not.toContain("danger");
  });

  it("scales tone with strength without reaching danger", () => {
    expect(LINK_STRENGTH_TONE.STRONG).toBe("warning");
    expect(LINK_STRENGTH_TONE.MODERATE).toBe("info");
    expect(LINK_STRENGTH_TONE.WEAK).toBe("neutral");
  });

  it("only offers destination types the counterparty endpoint accepts", () => {
    // The API rejects anything else with a 400 — see fraudOperations.ts.
    expect([...COUNTERPARTY_TYPES]).toEqual(["BANK_ACCOUNT", "WALLET_ADDRESS"]);
  });
});

describe("engine rule explanations", () => {
  it("explains every rule the engine can emit", () => {
    // An unexplained signal in the "why flagged" panel is the failure this
    // whole surface exists to prevent.
    for (const rule of ENGINE_RULES) {
      expect(engineRuleDescription(rule), `no description for ${rule}`).toBeTruthy();
    }
  });

  it("describes the two correlation rules in terms of what they observed", () => {
    expect(ENGINE_RULE_DESCRIPTION.WATCHLIST_MATCH).toMatch(/watchlist/i);
    expect(ENGINE_RULE_DESCRIPTION.THIRD_PARTY_FUNDING).toMatch(/sender/i);
  });

  it("returns undefined for an unknown rule rather than inventing one", () => {
    expect(engineRuleDescription("NOT_A_RULE")).toBeUndefined();
  });
});

describe("investigation checklist", () => {
  it("labels every state, including 'not applicable'", () => {
    // A checklist that cannot express "there is no device history for this
    // customer" gets abandoned, so the state is first-class.
    expect([...CHECKLIST_STATES]).toEqual(["PENDING", "DONE", "NOT_APPLICABLE"]);
    for (const state of CHECKLIST_STATES) {
      expect(CHECKLIST_STATE_LABEL[state]).toBeDefined();
    }
  });
});

describe("account takeover presentation", () => {
  it("tones every band, and treats no pattern as a positive result", () => {
    for (const band of ["NONE", "LOW", "ELEVATED", "HIGH", "CRITICAL"]) {
      expect(ATO_BAND_TONE[band], `no tone for ${band}`).toBeDefined();
    }
    expect(ATO_BAND_TONE.NONE).toBe("success");
    expect(ATO_BAND_TONE.CRITICAL).toBe("danger");
  });
});

/**
 * Section 90 of the specification, enforced rather than reviewed.
 *
 * Automated detection identifies patterns; investigators make determinations.
 * No string this console renders may assert that a customer IS something.
 */
describe("language", () => {
  const FORBIDDEN = [
    /\bfraudster/i,
    /\bcriminal/i,
    /money\s*launderer/i,
    /\bscammer/i,
    /\bthief\b/i,
  ];

  const allStrings = [
    ...Object.values(LINK_TYPE_LABEL),
    ...Object.values(WATCHLIST_ENTITY_LABEL),
    ...Object.values(WATCHLIST_CATEGORY_LABEL),
    ...Object.values(CHECKLIST_STATE_LABEL),
    ...Object.values(ENGINE_RULE_DESCRIPTION),
    ...Object.values(CASE_EVENT_LABEL).map((m) => m.label),
  ];

  it("never labels a person", () => {
    for (const value of allStrings) {
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(value), `"${value}" asserts what someone is`).toBe(false);
      }
    }
  });

  it("qualifies the mule category as potential", () => {
    // "Suspected mule" as a stored key is fine; what an investigator READS
    // must not read as an established fact.
    expect(WATCHLIST_CATEGORY_LABEL.SUSPECTED_MULE).toBe("Potential mule activity");
  });
});
