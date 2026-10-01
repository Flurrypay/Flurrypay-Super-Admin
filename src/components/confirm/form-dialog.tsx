"use client";

import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { type ReactNode, type SubmitEvent, useState } from "react";

import { Identifier } from "@/components/format/identifier";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { toAppError } from "@/lib/api/errors";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  submitLabel: string;
  tone?: "default" | "danger";
  /** Client-side check; return a message to block submission. */
  validate?: () => string | null;
  /** Rejections are shown in the dialog with the request reference. */
  onSubmit: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
}

/** A dialog wrapping a small form: validation message, API error with request ID, pending state. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  tone = "default",
  validate,
  onSubmit,
  children,
  className,
}: FormDialogProps) {
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const invalid = validate?.() ?? null;
    if (invalid) {
      setError({ message: invalid });
      return;
    }
    setPending(true);
    try {
      await onSubmit();
      onOpenChange(false);
    } catch (caught) {
      const appError = toAppError(caught);
      setError({ message: appError.userMessage, requestId: appError.requestId });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      {open && (
        <DialogContent className={className ?? "max-h-[90dvh] overflow-y-auto sm:max-w-lg"}>
          <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {children}
            {error && (
              <Alert tone="danger" role="alert">
                <TriangleAlertIcon aria-hidden />
                <AlertDescription className="grid gap-1">
                  <span>{error.message}</span>
                  {error.requestId && (
                    <span className="flex items-center gap-1.5 text-xs">
                      Reference <Identifier value={error.requestId} label="request reference" />
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
                disabled={pending}
              >
                {pending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** Label + control + hint, for FormDialog bodies. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The authenticator-code field for a FormDialog whose endpoint requires
 * step-up 2FA.
 *
 * Its own component rather than an inline Field so every such dialog asks for
 * the code the same way, with the same six-digit validation and the same
 * explanation of why it is being asked — a step-up prompt that looks different
 * on each screen is one people learn to click past.
 */
export function TwoFactorField({
  value,
  onChange,
  id = "step-up-2fa",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  return (
    <Field
      id={id}
      label="Authenticator code"
      hint="Required because this action changes a control, not just a record."
    >
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="max-w-40 font-mono tracking-widest"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

/** Blocks submission until a six-digit code is present. */
export function validateTwoFactor(code: string): string | null {
  return /^\d{6}$/.test(code.trim()) ? null : "Enter the 6-digit code from your authenticator app.";
}
