import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tooltip } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

import { entityToProfile, kycProfileSchema } from "@/features/kyc/api";
import { KycSummary } from "@/features/kyc/kyc-summary";

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/features/auth/admin-context", () => ({ useHasPermission: () => access.allowed }));
vi.mock("@/features/kyc/kyc-document", () => ({
  KycDocument: ({ label, location }: { label: string; location: string | null }) => (
    <span>{location ? label : "No document"}</span>
  ),
}));
vi.mock("@/components/confirm/confirm-action-dialog", () => ({
  ConfirmActionDialog: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div role="dialog">{title}</div> : null,
}));

function profile(canApprove = true) {
  return kycProfileSchema.parse({
    id: "k1",
    userId: "u1",
    currentLevel: 2,
    dailyWithdrawalLimit: 500000,
    level1: {
      providerVerified: true,
      status: "VERIFIED",
      verifiedFirstName: "Ada",
      verifiedLastName: "Okafor",
      verifiedGender: "female",
      bvnLast4: "12345678901",
    },
    level2: { status: "VERIFIED", ninLast4: "22222222222", identityMatched: true },
    level3: {
      status: "PENDING",
      canApprove,
      documentUrl: "private/kyc-document/u1/proof.pdf",
      livenessUrl: "private/selfie/u1/frame.jpg",
      livenessCheckPassed: true,
      identityReference: "VERIFIED_NIN",
      livenessScore: 99,
      faceMatchScore: 98,
    },
  });
}
function show(canApprove = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Tooltip.Provider>
        <KycSummary profile={profile(canApprove)} customerName="Ada Okafor" />
      </Tooltip.Provider>
    </QueryClientProvider>,
  );
}

describe("linked KYC admin review", () => {
  it("shows the new ladder and provides manual decisions only for Level 3", () => {
    access.allowed = true;
    show();
    expect(screen.getByText("Level 1 · BVN")).toBeInTheDocument();
    expect(screen.getByText("Level 2 · NIN")).toBeInTheDocument();
    expect(screen.getByText("Level 3 · Address and live identity")).toBeInTheDocument();
    expect(screen.getByText("Passed against verified NIN")).toBeInTheDocument();
    expect(screen.getByText("Proof of address")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Approve level 3");
    expect(document.body.textContent).not.toContain("12345678901");
  });
  it("blocks approval when the backend has incomplete evidence, while allowing rejection", () => {
    access.allowed = true;
    show(false);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });
  it("does not expose decisions without review permission", () => {
    access.allowed = false;
    show();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
  it("maps the same NIN/address/live-capture evidence from the user-detail endpoint", () => {
    const raw = {
      id: "k1",
      userId: "u1",
      bvn: "11111111111",
      nin: "22222222222",
      level1Status: "VERIFIED",
      level2Status: "VERIFIED",
      level3Status: "PENDING",
      proofOfAddressDocumentUrl: "private/proof/u1/document.pdf",
      residentialAddress: "1 Test Street",
      livenessCheckUrl: "private/selfie/u1/frame.jpg",
      livenessCheckPassed: true,
      faceMatchVerifiedAt: "2026-10-28T12:00:00Z",
      identityVerificationEvidence: {
        version: 1,
        bvn: { number: "11111111111" },
        nin: { number: "22222222222", matchedBvn: "11111111111" },
        biometric: {
          sessionId: "s1",
          provider: "AWS_REKOGNITION",
          livenessScore: 99,
          faceScore: 98,
          bvn: "11111111111",
          nin: "22222222222",
        },
      },
    };
    const result = kycProfileSchema.parse(entityToProfile(raw));
    expect(result.level2.ninLast4).toBe("2222");
    expect(result.level2.identityMatched).toBe(true);
    expect(result.level3.documentUrl).toBe(raw.proofOfAddressDocumentUrl);
    expect(result.level3.canApprove).toBe(true);
    expect(JSON.stringify(result)).not.toContain("11111111111");
    expect(
      kycProfileSchema.parse(entityToProfile({ ...raw, identityVerificationEvidence: null })).level3
        .canApprove,
    ).toBe(false);
  });
});
