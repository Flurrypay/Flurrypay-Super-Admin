import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { KycFilter } from "@/features/kyc/api";
import { KycWorkflowOverview } from "@/features/kyc/kyc-workflow-overview";

const summary = { all: 12, ready: 3, actionRequired: 5, legacy: 2 };

describe("verification workflow overview", () => {
  it("connects count cards to the selected queue and exposes the automatic/manual split", () => {
    function Harness() {
      const [filter, setFilter] = useState<KycFilter>("ready");
      return <KycWorkflowOverview summary={summary} filter={filter} onSelect={setFilter} />;
    }
    render(<Harness />);
    const ready = screen.getByRole("button", { name: /Ready for review/ });
    const legacy = screen.getByRole("button", { name: /Legacy submissions/ });
    expect(ready).toHaveAttribute("aria-pressed", "true");
    expect(ready).toHaveTextContent("3");
    fireEvent.click(legacy);
    expect(legacy).toHaveAttribute("aria-pressed", "true");
    expect(ready).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText("Automatic")).toHaveLength(2);
    expect(screen.getByText("Admin review")).toBeInTheDocument();
    expect(screen.getByText("Includes legacy follow-up")).toBeInTheDocument();
  });
  it("links dashboard cards to the exact filtered queue", () => {
    render(<KycWorkflowOverview summary={summary} />);
    expect(screen.getByRole("link", { name: /Legacy submissions/ })).toHaveAttribute(
      "href",
      "/kyc?filter=legacy",
    );
    expect(screen.getByRole("link", { name: /Needs customer action/ })).toHaveAttribute(
      "href",
      "/kyc?filter=action_required",
    );
  });
  it("shows unavailable counts honestly instead of fabricating zeroes", () => {
    render(<KycWorkflowOverview error />);
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent("could not be loaded");
  });
});
