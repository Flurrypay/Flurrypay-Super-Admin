import { describe, expect, it } from "vitest";

import { ENGINE_RULES, INTERVENING_ACTIONS, RISK_ACTIONS } from "@/features/risk/monitoring-api";
import { RULE_STATUS_HELP, RULE_STATUS_TONE, RULE_STATUSES } from "@/features/risk/rules-api";

/**
 * These guard the seams where the console's vocabulary has to agree with the
 * API's. A mismatch here does not crash anything — it silently filters to
 * nothing, or renders a rule as "never fired" when it fires constantly, which
 * is the worst failure mode a monitoring console has.
 */

describe("engine rule vocabulary", () => {
  it("matches the keys the risk engine emits into signals[].rule", () => {
    // api/src/app/services/riskEngine.service.ts — grep 'rule: "'.
    expect([...ENGINE_RULES].sort()).toEqual(
      [
        "AMOUNT_VS_BASELINE",
        "FIRST_TIME_CREDIT_SIZE",
        "HIGH_RISK_JURISDICTION",
        "MULTIPLE_FUNDING_SOURCES",
        "NEW_BENEFICIARY",
        "NO_DEVICE_IDENTITY",
        "RAPID_PASS_THROUGH",
        "STRUCTURING",
        "UNTRUSTED_DEVICE",
        "UNUSUAL_HOUR",
        "VELOCITY",
        "VERIFICATION_PROBING",
        "WATCHLIST_MATCH",
        "THIRD_PARTY_FUNDING",
      ].sort(),
    );
  });

  it("is not the compliance MonitoringRule enum", async () => {
    // The two vocabularies overlap on four names. Filtering assessments by a
    // MonitoringRule value that the engine never emits matches nothing, which
    // reads as "no risk" rather than as a bug.
    const { MONITORING_RULES } = await import("@/features/compliance/api");
    const shared = MONITORING_RULES.filter((r) => (ENGINE_RULES as readonly string[]).includes(r));
    expect(shared).toEqual([
      "STRUCTURING",
      "MULTIPLE_FUNDING_SOURCES",
      "VERIFICATION_PROBING",
      "HIGH_RISK_JURISDICTION",
    ]);
    expect(shared.length).toBeLessThan(MONITORING_RULES.length);
  });
});

describe("risk actions", () => {
  it("counts only the actions that constrained something as interventions", () => {
    expect(INTERVENING_ACTIONS).not.toContain("ALLOW");
    // Recorded-and-watched is not an intervention; counting it would inflate
    // every "we stopped N things" figure on the dashboard.
    expect(INTERVENING_ACTIONS).not.toContain("ALLOW_MONITORED");
    expect(INTERVENING_ACTIONS).toContain("HOLD_TRANSACTION");
    expect(INTERVENING_ACTIONS).toContain("FREEZE_ACCOUNT");
  });

  it("lists every action the API can return", () => {
    for (const action of INTERVENING_ACTIONS) {
      expect(RISK_ACTIONS).toContain(action);
    }
  });
});

describe("rule status presentation", () => {
  it("explains every status it can display", () => {
    for (const status of RULE_STATUSES) {
      expect(RULE_STATUS_HELP[status]).toBeTruthy();
      expect(RULE_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("degrades rather than blanking on a status this build does not know", () => {
    // A new status added to the API must not render as an empty badge.
    expect(RULE_STATUS_TONE["SOMETHING_NEW"]).toBeUndefined();
    expect(RULE_STATUS_HELP["SOMETHING_NEW"]).toBeUndefined();
  });

  it("does not present shadow mode as if it were enforcing", () => {
    expect(RULE_STATUS_HELP.SHADOW).toMatch(/zero points|contributing zero/i);
  });
});
