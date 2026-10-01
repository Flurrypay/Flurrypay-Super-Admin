"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircleIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Identifier } from "@/components/format/identifier";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toAppError } from "@/lib/api/errors";

/** Credentials the endpoint's step-up middleware reads from the request body. */
export interface StepUpRequirement {
  password?: boolean;
  pin?: boolean;
  twoFactor?: boolean;
}

export interface ConfirmValues {
  reason: string;
  password?: string;
  pin?: string;
  twoFACode?: string;
}

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Who or what the action applies to. */
  target: ReactNode;
  /** What will happen, in plain language. */
  impact: ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  reason?: { required: boolean; minLength?: number; label?: string; hint?: string };
  stepUp?: StepUpRequirement;
  /** Type-to-confirm phrase for irreversible actions. */
  confirmPhrase?: string;
  /** A statement the admin must tick before confirming (e.g. what they checked). */
  acknowledgement?: ReactNode;
  onConfirm: (values: ConfirmValues) => Promise<unknown>;
}

const STEP_UP_FIELD_BY_CODE: Record<string, keyof ConfirmValues> = {
  ADMIN_PASSWORD_MISSING: "password",
  ADMIN_PASSWORD_INVALID: "password",
  ADMIN_PIN_MISSING: "pin",
  ADMIN_PIN_INCORRECT: "pin",
  ADMIN_PIN_LOCKED: "pin",
  ADMIN_2FA_CODE_MISSING: "twoFACode",
  ADMIN_2FA_INVALID: "twoFACode",
};

const otp = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

function buildSchema(
  reason: ConfirmActionDialogProps["reason"],
  stepUp: StepUpRequirement | undefined,
  phrase: string | undefined,
  acknowledge: boolean,
) {
  const minLength = reason?.required ? Math.max(reason.minLength ?? 5, 1) : 0;
  return z.object({
    reason: minLength
      ? z
          .string()
          .trim()
          .min(minLength, `Give a reason of at least ${minLength} characters`)
          .max(500)
      : z.string().trim().max(500),
    password: stepUp?.password ? z.string().min(1, "Enter your password") : z.string().optional(),
    pin: stepUp?.pin ? otp : z.string().optional(),
    twoFACode: stepUp?.twoFactor ? otp : z.string().optional(),
    phrase: phrase
      ? z.string().refine((value) => value.trim() === phrase, `Type ${phrase} to confirm`)
      : z.string().optional(),
    acknowledged: acknowledge
      ? z.boolean().refine(Boolean, "Confirm this before continuing")
      : z.boolean().optional(),
  });
}

type FormValues = z.input<ReturnType<typeof buildSchema>>;

/**
 * Confirmation for sensitive operations: action, target, impact, reason and
 * the step-up credentials the API requires. Never uses window.confirm().
 */
export function ConfirmActionDialog(props: ConfirmActionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ConfirmForm {...props} />}
    </Dialog>
  );
}

function ConfirmForm({
  onOpenChange,
  title,
  target,
  impact,
  confirmLabel,
  tone = "default",
  reason,
  stepUp,
  confirmPhrase,
  acknowledgement,
  onConfirm,
}: ConfirmActionDialogProps) {
  const needsAcknowledgement = Boolean(acknowledgement);
  const schema = useMemo(
    () => buildSchema(reason, stepUp, confirmPhrase, needsAcknowledgement),
    [reason, stepUp, confirmPhrase, needsAcknowledgement],
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: "",
      password: "",
      pin: "",
      twoFACode: "",
      phrase: "",
      acknowledged: false,
    },
  });
  const [formError, setFormError] = useState<{
    message: string;
    requestId?: string;
    code?: string;
  } | null>(null);
  const { errors, isSubmitting } = form.formState;
  const needsStepUp = Boolean(stepUp?.password || stepUp?.pin || stepUp?.twoFactor);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onConfirm({
        reason: values.reason.trim(),
        password: stepUp?.password ? values.password : undefined,
        pin: stepUp?.pin ? values.pin?.trim() : undefined,
        twoFACode: stepUp?.twoFactor ? values.twoFACode?.trim() : undefined,
      });
      onOpenChange(false);
    } catch (error) {
      const appError = toAppError(error);
      const field = STEP_UP_FIELD_BY_CODE[appError.code];
      if (field && field !== "reason") {
        form.setError(field, { type: "server", message: appError.userMessage });
        form.setFocus(field);
        return;
      }
      setFormError({
        message: appError.userMessage,
        requestId: appError.requestId,
        code: appError.code,
      });
    }
  });

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tone === "danger" && (
              <TriangleAlertIcon className="size-4 text-destructive" aria-hidden />
            )}
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-foreground">
                {target}
              </div>
              <div>{impact}</div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {reason && (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-reason">
              {reason.label ?? "Reason"}
              {!reason.required && (
                <span className="font-normal text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Textarea
              id="confirm-reason"
              aria-invalid={Boolean(errors.reason)}
              aria-describedby="confirm-reason-hint"
              {...form.register("reason")}
            />
            <p id="confirm-reason-hint" className="text-xs text-muted-foreground">
              {errors.reason?.message ?? reason.hint ?? "Recorded in the audit log."}
            </p>
          </div>
        )}

        {needsStepUp && (
          <fieldset className="grid gap-3 rounded-md border px-3 pt-2 pb-3">
            <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
              <ShieldCheckIcon className="size-3.5" aria-hidden />
              This action requires additional verification
            </legend>
            {stepUp?.password && (
              <StepUpField
                id="confirm-password"
                label="Account password"
                error={errors.password?.message}
              >
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  {...form.register("password")}
                />
              </StepUpField>
            )}
            {stepUp?.pin && (
              <StepUpField id="confirm-pin" label="Transaction PIN" error={errors.pin?.message}>
                <Input
                  id="confirm-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  aria-invalid={Boolean(errors.pin)}
                  {...form.register("pin")}
                />
              </StepUpField>
            )}
            {stepUp?.twoFactor && (
              <StepUpField
                id="confirm-2fa"
                label="Authenticator code"
                error={errors.twoFACode?.message}
              >
                <Input
                  id="confirm-2fa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-invalid={Boolean(errors.twoFACode)}
                  {...form.register("twoFACode")}
                />
              </StepUpField>
            )}
          </fieldset>
        )}

        {confirmPhrase && (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-phrase">
              Type <span className="font-mono">{confirmPhrase}</span> to confirm
            </Label>
            <Input
              id="confirm-phrase"
              autoComplete="off"
              aria-invalid={Boolean(errors.phrase)}
              {...form.register("phrase")}
            />
            {errors.phrase && <p className="text-xs text-destructive">{errors.phrase.message}</p>}
          </div>
        )}

        {acknowledgement && (
          <div className="grid gap-1">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-(--primary)"
                aria-invalid={Boolean(errors.acknowledged)}
                {...form.register("acknowledged")}
              />
              <span>{acknowledgement}</span>
            </label>
            {errors.acknowledged && (
              <p className="text-xs text-destructive">{errors.acknowledged.message}</p>
            )}
          </div>
        )}

        {formError && (
          <Alert tone="danger" role="alert">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>This action could not be completed.</AlertTitle>
            <AlertDescription className="grid gap-1">
              <span>{formError.message}</span>
              {formError.code === "ADMIN_2FA_NOT_ENABLED" ||
              formError.code === "ADMIN_PIN_NOT_SET" ? (
                <Link href="/security" className="text-foreground underline underline-offset-2">
                  Open security settings
                </Link>
              ) : null}
              {formError.requestId && (
                <span className="flex items-center gap-1.5 text-xs">
                  Reference <Identifier value={formError.requestId} label="request reference" />
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant={tone === "danger" ? "destructive" : "primary"}
            disabled={isSubmitting}
          >
            {isSubmitting && <LoaderCircleIcon className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function StepUpField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
