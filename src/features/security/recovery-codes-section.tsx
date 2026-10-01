"use client";

import { CopyIcon, DownloadIcon, KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DetailSection } from "@/components/detail/detail-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { generateRecoveryCodes } from "./api";

interface RecoveryCodesSectionProps {
  twoFactorEnabled: boolean;
  remaining: number;
  onChanged: () => Promise<unknown>;
}

/** Single-use codes for signing in without the authenticator app. Shown once when generated. */
export function RecoveryCodesSection({
  twoFactorEnabled,
  remaining,
  onChanged,
}: RecoveryCodesSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  const text = codes
    ? `FlurryPay Admin recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`
    : "";

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "flurrypay-admin-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DetailSection
      title="Recovery codes"
      description="Sign in with one of these if you lose access to your authenticator app. Each code works once."
      actions={
        twoFactorEnabled ? (
          <Badge tone={remaining > 2 ? "success" : "warning"}>{remaining} of 10 left</Badge>
        ) : (
          <Badge tone="neutral">Needs 2FA</Badge>
        )
      }
    >
      {codes ? (
        <div className="grid gap-3">
          <Alert tone="warning">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription className="text-foreground">
              Save these now: they won&apos;t be shown again. Your previous codes no longer work.
            </AlertDescription>
          </Alert>
          <ol className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-5">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(codes.join("\n"))
                  .then(() => toast.success("Codes copied"));
              }}
            >
              <CopyIcon aria-hidden />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <DownloadIcon aria-hidden />
              Download .txt
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCodes(null);
              }}
            >
              I&apos;ve saved them
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          <p className="text-muted-foreground">
            {twoFactorEnabled
              ? remaining === 0
                ? "You have no recovery codes. Generate a set and store it somewhere safe, away from your phone."
                : "Generating a new set replaces the codes you have now."
              : "Enable two-factor authentication first."}
          </p>
          <Button
            variant="outline"
            className="w-fit"
            disabled={!twoFactorEnabled}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <KeyRoundIcon aria-hidden />
            {remaining === 0 ? "Generate recovery codes" : "Generate new codes"}
          </Button>
        </div>
      )}

      <ConfirmActionDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Generate recovery codes"
        target="Your administrator account"
        impact="A new set of 10 single-use codes is created and any existing codes stop working."
        confirmLabel="Generate"
        stepUp={{ twoFactor: true }}
        onConfirm={async ({ twoFACode }) => {
          const result = await generateRecoveryCodes(twoFACode ?? "");
          setCodes(result.codes);
          await onChanged();
        }}
      />
    </DetailSection>
  );
}
