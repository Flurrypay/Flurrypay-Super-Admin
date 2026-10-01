"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, LoaderCircleIcon } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserMessage } from "@/lib/api/errors";

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your app"),
});

interface TotpEnrolmentProps {
  otpauth: string;
  secret: string;
  onVerify: (code: string) => Promise<unknown>;
  submitLabel?: string;
}

/**
 * Authenticator enrolment. The QR code is generated locally (the secret never
 * leaves the page) and the manual setup key is hidden until requested.
 */
export function TotpEnrolment({
  otpauth,
  secret,
  onVerify,
  submitLabel = "Verify and enable",
}: TotpEnrolmentProps) {
  const [qr, setQr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const form = useForm<z.input<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(otpauth, { margin: 1, width: 176, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setShowKey(true);
      });
    return () => {
      active = false;
    };
  }, [otpauth]);

  const submit = form.handleSubmit(async ({ code }) => {
    try {
      await onVerify(code.trim());
    } catch (error) {
      form.setError("code", { type: "server", message: getUserMessage(error) });
    }
  });

  return (
    <div className="grid gap-4">
      <ol className="grid list-decimal gap-1 pl-4 text-sm text-muted-foreground">
        <li>Open an authenticator app (Google Authenticator, 1Password, Authy).</li>
        <li>Scan the QR code, or enter the setup key manually.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-md border bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL generated locally; next/image adds nothing here
            <img src={qr} alt="QR code for your authenticator app" width={176} height={176} />
          ) : (
            <Skeleton className="size-44" />
          )}
        </div>
        <div className="grid w-full gap-2 text-sm">
          <p className="text-muted-foreground">Can&apos;t scan?</p>
          {showKey ? (
            <code className="rounded-md border bg-muted px-2 py-1.5 font-mono text-xs break-all select-all">
              {secret}
            </code>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                setShowKey(true);
              }}
            >
              <EyeIcon aria-hidden />
              Show setup key
            </Button>
          )}
        </div>
      </div>
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-1.5">
        <Label htmlFor="totp-code">Authenticator code</Label>
        <div className="flex gap-2">
          <Input
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="max-w-40 font-mono tracking-widest"
            aria-invalid={Boolean(form.formState.errors.code)}
            aria-describedby="totp-code-error"
            {...form.register("code")}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && (
              <LoaderCircleIcon className="animate-spin" aria-hidden />
            )}
            {submitLabel}
          </Button>
        </div>
        <p id="totp-code-error" role="alert" className="text-xs text-destructive">
          {form.formState.errors.code?.message}
        </p>
      </form>
    </div>
  );
}
