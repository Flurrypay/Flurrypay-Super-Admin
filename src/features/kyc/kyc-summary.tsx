"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/features/auth/admin-context";
import { humanizeEnum } from "@/lib/format";

import { approveKycLevel, type KycLevel, type KycProfile, rejectKycLevel } from "./api";
import { KycDocument } from "./kyc-document";
import { KYC_LEVEL_INFO, KYC_STATUS } from "./labels";

type Decision = { level: KycLevel; kind: "approve" | "reject" } | null;

interface KycSummaryProps {
  profile: KycProfile;
  customerName: string;
}

export function KycSummary({ profile, customerName }: KycSummaryProps) {
  const canReview = useHasPermission("kyc.review");
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision>(null);

  const decide = useMutation({
    mutationFn: ({
      level,
      kind,
      reason,
      twoFACode,
    }: {
      level: KycLevel;
      kind: "approve" | "reject";
      reason: string;
      twoFACode: string;
    }) =>
      kind === "approve"
        ? approveKycLevel(profile.userId, level, twoFACode)
        : rejectKycLevel(profile.userId, level, reason, twoFACode),
    onSuccess: async (_data, { level, kind }) => {
      toast.success(
        `Level ${level} ${kind === "approve" ? "approved" : "rejected"} for ${customerName}`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kyc-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["user-kyc", profile.userId] }),
        queryClient.invalidateQueries({ queryKey: ["user", profile.userId] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
      ]);
    },
  });

  const actions = (level: KycLevel, status: string) =>
    canReview && status === "PENDING" ? (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDecision({ level, kind: "reject" });
          }}
        >
          <XIcon aria-hidden />
          Reject
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setDecision({ level, kind: "approve" });
          }}
        >
          <CheckIcon aria-hidden />
          Approve
        </Button>
      </div>
    ) : null;

  const { level1, level2, level3 } = profile;
  const verifiedName = [
    level1.verifiedFirstName,
    level1.verifiedMiddleName,
    level1.verifiedLastName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-4">
      <DetailSection title="Limits">
        <DetailList
          columns={2}
          items={[
            {
              label: "Current level",
              value: <span className="tabular-nums">{profile.currentLevel}</span>,
            },
            {
              label: "Daily withdrawal limit",
              value: <Amount value={profile.dailyWithdrawalLimit} currency="NGN" />,
            },
            { label: "Last reviewed", value: <DateTime value={profile.lastReviewAt} /> },
            {
              label: "Reviewed by",
              value: (
                <Identifier value={profile.lastReviewedBy} truncate label="administrator ID" />
              ),
            },
          ]}
        />
      </DetailSection>

      <DetailSection
        title={KYC_LEVEL_INFO[1].title}
        description={KYC_LEVEL_INFO[1].description}
        actions={actions(1, level1.status)}
      >
        {level1.nameMismatch && (
          <Alert tone="warning" className="mb-3">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription className="text-foreground">
              The registry name does not match the name on the account.
            </AlertDescription>
          </Alert>
        )}
        <DetailList
          columns={2}
          items={[
            {
              label: "Status",
              value: <StatusBadge status={resolveStatus(KYC_STATUS, level1.status)} />,
            },
            { label: "Verified", value: <DateTime value={level1.verifiedAt} /> },
            { label: "Identity type", value: level1.identityType },
            {
              label: "Identity number",
              value: level1.identityNumberLast4 ? `•••••••${level1.identityNumberLast4}` : null,
              hint: "Only the last four digits are shown.",
            },
            {
              label: "BVN",
              value: level1.bvnLast4 ? `•••••••${level1.bvnLast4}` : null,
              hideWhenEmpty: true,
            },
            {
              label: "NIN",
              value: level1.ninLast4 ? `•••••••${level1.ninLast4}` : null,
              hideWhenEmpty: true,
            },
            { label: "Registry name", value: verifiedName || null },
            { label: "Registry birth date", value: level1.verifiedBirthdate },
          ]}
        />
      </DetailSection>

      <DetailSection
        title={KYC_LEVEL_INFO[2].title}
        description={KYC_LEVEL_INFO[2].description}
        actions={actions(2, level2.status)}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <DetailList
            items={[
              {
                label: "Status",
                value: <StatusBadge status={resolveStatus(KYC_STATUS, level2.status)} />,
              },
              { label: "Submitted", value: <DateTime value={level2.submittedAt} /> },
              {
                label: "Verified",
                value: <DateTime value={level2.verifiedAt} />,
                hideWhenEmpty: true,
              },
              { label: "Rejection reason", value: level2.rejectionReason, hideWhenEmpty: true },
              {
                label: "Document type",
                value: level2.proofOfAddressType ? humanizeEnum(level2.proofOfAddressType) : null,
              },
              { label: "Address", value: level2.residentialAddress },
              {
                label: "Area",
                value:
                  [level2.city, level2.lgaName, level2.stateName].filter(Boolean).join(", ") ||
                  null,
              },
              {
                label: "Address check",
                value: level2.addressVerificationStatus
                  ? `${humanizeEnum(level2.addressVerificationStatus)}${level2.addressVerificationIsVague ? " (address flagged as vague)" : ""}`
                  : null,
              },
            ]}
          />
          {level2.submitted && (
            <KycDocument location={level2.documentUrl} label="Proof of address" />
          )}
        </div>
      </DetailSection>

      <DetailSection
        title={KYC_LEVEL_INFO[3].title}
        description={KYC_LEVEL_INFO[3].description}
        actions={actions(3, level3.status)}
      >
        <div className="grid gap-4">
          <DetailList
            columns={2}
            items={[
              {
                label: "Status",
                value: <StatusBadge status={resolveStatus(KYC_STATUS, level3.status)} />,
              },
              { label: "Verified", value: <DateTime value={level3.verifiedAt} /> },
              { label: "Rejection reason", value: level3.rejectionReason, hideWhenEmpty: true },
              {
                label: "ID type",
                value: level3.governmentIdType ? humanizeEnum(level3.governmentIdType) : null,
              },
              {
                label: "ID number",
                value: level3.governmentIdNumberLast4
                  ? `•••••${level3.governmentIdNumberLast4}`
                  : null,
              },
              { label: "ID expiry", value: level3.expiryDate },
              { label: "Name on document", value: level3.governmentIdVerifiedName },
              {
                label: "Document check",
                value: level3.governmentIdDocumentStatus
                  ? humanizeEnum(level3.governmentIdDocumentStatus)
                  : null,
              },
              {
                label: "Liveness",
                value: level3.submitted
                  ? level3.livenessCheckPassed
                    ? "Passed"
                    : "Not passed"
                  : null,
              },
              {
                label: "Face match score",
                value:
                  level3.faceMatchScore == null ? null : (
                    <span className="tabular-nums">{level3.faceMatchScore}</span>
                  ),
                hint: "Similarity score from the verification provider, as reported.",
              },
            ]}
          />
          {level3.submitted && (
            <div className="flex flex-wrap gap-4">
              <KycDocument location={level3.frontUrl} label="ID front" />
              <KycDocument location={level3.backUrl} label="ID back" />
            </div>
          )}
        </div>
      </DetailSection>

      <ConfirmActionDialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) setDecision(null);
        }}
        title={
          decision?.kind === "approve"
            ? `Approve level ${decision.level}`
            : `Reject level ${decision?.level ?? ""}`
        }
        target={
          <span className="grid">
            <span className="font-medium">{customerName}</span>
            <span className="text-xs text-muted-foreground">
              {decision ? KYC_LEVEL_INFO[decision.level].title : ""}
            </span>
          </span>
        }
        impact={
          decision?.kind === "approve"
            ? "The customer moves to this level and their withdrawal limit rises. Recorded in the audit log."
            : "The level is marked rejected. The customer sees your reason and can resubmit."
        }
        confirmLabel={decision?.kind === "approve" ? "Approve" : "Reject"}
        tone={decision?.kind === "reject" ? "danger" : "default"}
        reason={
          decision?.kind === "reject"
            ? {
                required: true,
                minLength: 10,
                label: "Reason shown to the customer",
                hint: "Be specific about what to fix.",
              }
            : undefined
        }
        // A level decision changes how much the customer may withdraw per day,
        // so the API requires a fresh authenticator code alongside kyc.review.
        stepUp={{ twoFactor: true }}
        onConfirm={({ reason, twoFACode }) => {
          if (!decision) return Promise.resolve();
          return decide.mutateAsync({
            level: decision.level,
            kind: decision.kind,
            reason,
            twoFACode: twoFACode ?? "",
          });
        }}
      />
    </div>
  );
}
