"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  InfoIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MailIcon,
  ShieldAlertIcon,
  SmartphoneIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, type SubmitEvent, useEffect, useState } from "react";
import {
  type Control,
  type ControllerRenderProps,
  type FieldValues,
  type Path,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getUserMessage, toAppError } from "@/lib/api/errors";

import {
  completeForcedPasswordReset,
  confirmOnboardingTotp,
  type LoginStep,
  resendEmailCode,
  sendDeviceChallengeSms,
  sendOnboardingPhoneOtp,
  startOnboardingTotp,
  submitEmailCode,
  submitPassword,
  submitTotp,
  verifyDeviceChallenge,
  verifyOnboardingPhoneOtp,
} from "../api";
import { safeNextPath } from "../safe-redirect";
import { type SessionEndReason, sessionStore, useHasHydrated, useSessionState } from "../session";
import { TotpEnrolment } from "./totp-enrolment";

type Step =
  | { kind: "credentials" }
  | { kind: "email-code"; email: string }
  | { kind: "totp"; email: string }
  | { kind: "password-reset"; email: string }
  | { kind: "onboarding"; email: string; token: string; needs2FA: boolean; needsPhone: boolean }
  | { kind: "device-challenge"; email: string; challengeToken: string }
  | { kind: "onboarding-complete" };

const END_REASON_MESSAGES: Record<SessionEndReason, string> = {
  expired: "Your session expired. Sign in again to continue.",
  terminated: "Your session ended because this account signed in elsewhere.",
  device: "For your security, the session was ended: it was used from an unrecognised device.",
  suspended: "This administrator account has been suspended.",
  "signed-out": "You have been signed out.",
};

const code6 = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export function LoginFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, endReason } = useSessionState();
  const hydrated = useHasHydrated();
  const [step, setStep] = useState<Step>({ kind: "credentials" });

  // Already signed in (e.g. a bookmarked /login): continue to the destination.
  useEffect(() => {
    if (hydrated && session) router.replace(safeNextPath(searchParams.get("next")) as Route);
  }, [hydrated, session, router, searchParams]);

  function advance(result: LoginStep, email: string) {
    switch (result.kind) {
      case "authenticated":
        sessionStore.start(result.token);
        router.replace(safeNextPath(searchParams.get("next")) as Route);
        return;
      case "email-code":
        setStep({ kind: "email-code", email });
        return;
      case "totp":
        setStep({ kind: "totp", email: result.email });
        return;
      case "password-reset":
        setStep({ kind: "password-reset", email: result.email });
        return;
      case "onboarding":
        setStep({
          kind: "onboarding",
          email: result.email,
          token: result.onboardingToken,
          needs2FA: result.needs2FA,
          needsPhone: result.needsPhone,
        });
        return;
      case "device-challenge":
        setStep({
          kind: "device-challenge",
          email: result.email,
          challengeToken: result.challengeToken,
        });
        return;
    }
  }

  const restart = () => {
    setStep({ kind: "credentials" });
  };

  return (
    <div className="grid gap-5">
      {step.kind === "credentials" && endReason && (
        <Alert tone={endReason === "device" || endReason === "suspended" ? "warning" : "info"}>
          <InfoIcon aria-hidden />
          <AlertDescription className="text-foreground">
            {END_REASON_MESSAGES[endReason]}
          </AlertDescription>
        </Alert>
      )}
      {step.kind === "credentials" && <CredentialsStep onResult={advance} />}
      {step.kind === "email-code" && (
        <EmailCodeStep email={step.email} onResult={advance} onBack={restart} />
      )}
      {step.kind === "totp" && <TotpStep email={step.email} onResult={advance} onBack={restart} />}
      {step.kind === "password-reset" && (
        <PasswordResetStep
          email={step.email}
          onBack={restart}
          onDone={(state) => {
            if (!state.needs2FA && !state.needsPhone) setStep({ kind: "onboarding-complete" });
            else
              setStep({
                kind: "onboarding",
                email: step.email,
                token: state.onboardingToken,
                ...state,
              });
          }}
        />
      )}
      {step.kind === "onboarding" && (
        <OnboardingStep
          step={step}
          onUpdate={setStep}
          onComplete={() => {
            setStep({ kind: "onboarding-complete" });
          }}
        />
      )}
      {step.kind === "device-challenge" && (
        <DeviceChallengeStep step={step} onResult={advance} onBack={restart} />
      )}
      {step.kind === "onboarding-complete" && (
        <div className="grid gap-4">
          <StepHeading
            icon={<CircleCheckIcon className="text-success" aria-hidden />}
            title="Your account is ready"
            description="Setup is complete. Sign in with your new password to continue."
          />
          <Button onClick={restart}>Continue to sign in</Button>
        </div>
      )}
    </div>
  );
}

/* ─── Steps ──────────────────────────────────────────────────────────────── */

type StepProps = { onResult: (result: LoginStep, email: string) => void };

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
});

function CredentialsStep({ onResult }: StepProps) {
  const form = useForm<
    z.input<typeof credentialsSchema>,
    unknown,
    z.output<typeof credentialsSchema>
  >({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });
  const submit = useSubmit(form, async (values) => {
    onResult(await submitPassword(values), values.email);
  });

  return (
    <Form {...form}>
      <form onSubmit={submit.handler} noValidate className="grid gap-4">
        <StepHeading title="Sign in" description="Restricted to authorised FlurryPay staff." />
        <Field
          control={form.control}
          name="email"
          label="Work email"
          render={(field) => <Input type="email" autoComplete="username" autoFocus {...field} />}
        />
        <Field
          control={form.control}
          name="password"
          label="Password"
          render={(field) => <Input type="password" autoComplete="current-password" {...field} />}
        />
        <FormError message={submit.error} />
        <SubmitButton pending={submit.pending}>Continue</SubmitButton>
      </form>
    </Form>
  );
}

const emailCodeSchema = z.object({
  code: z.string().trim().min(4, "Enter the code from your email"),
});

function EmailCodeStep({
  email,
  onResult,
  onBack,
}: StepProps & { email: string; onBack: () => void }) {
  const form = useForm<z.input<typeof emailCodeSchema>>({
    resolver: zodResolver(emailCodeSchema),
    defaultValues: { code: "" },
  });
  const submit = useSubmit(form, async ({ code }) => {
    onResult(await submitEmailCode({ email, code: code.trim() }), email);
  });
  const resend = useMutation({
    mutationFn: () => resendEmailCode(email),
    onSuccess: () => toast.success("A new code has been sent if the account exists."),
    onError: (error) => toast.error(getUserMessage(error)),
  });

  return (
    <Form {...form}>
      <form onSubmit={submit.handler} noValidate className="grid gap-4">
        <BackButton onClick={onBack} />
        <StepHeading
          icon={<MailIcon aria-hidden />}
          title="Check your email"
          description={`Enter the sign-in code sent to ${email}. It expires in 10 minutes.`}
        />
        <Field
          control={form.control}
          name="code"
          label="Sign-in code"
          render={(field) => (
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="font-mono tracking-widest"
              {...field}
            />
          )}
        />
        <FormError message={submit.error} />
        <SubmitButton pending={submit.pending}>Verify</SubmitButton>
        <Button
          type="button"
          variant="link"
          className="h-auto justify-self-start p-0"
          onClick={() => {
            resend.mutate();
          }}
          disabled={resend.isPending}
        >
          Resend code
        </Button>
      </form>
    </Form>
  );
}

const totpSchema = z.object({ code: code6 });
const recoverySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{5}-?[a-z0-9]{5}$/i, "Enter a recovery code, e.g. 3f9a2-c81d7"),
});

function TotpStep({ email, onResult, onBack }: StepProps & { email: string; onBack: () => void }) {
  const [useRecovery, setUseRecovery] = useState(false);
  return useRecovery ? (
    <RecoveryCodeStep
      email={email}
      onResult={onResult}
      onBack={onBack}
      onUseAuthenticator={() => {
        setUseRecovery(false);
      }}
    />
  ) : (
    <AuthenticatorCodeStep
      email={email}
      onResult={onResult}
      onBack={onBack}
      onUseRecovery={() => {
        setUseRecovery(true);
      }}
    />
  );
}

function AuthenticatorCodeStep({
  email,
  onResult,
  onBack,
  onUseRecovery,
}: StepProps & { email: string; onBack: () => void; onUseRecovery: () => void }) {
  const form = useForm<z.input<typeof totpSchema>>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: "" },
  });
  const submit = useSubmit(form, async ({ code }) => {
    onResult(await submitTotp({ email, twoFaCode: code.trim() }), email);
  });

  return (
    <Form {...form}>
      <form onSubmit={submit.handler} noValidate className="grid gap-4">
        <BackButton onClick={onBack} />
        <StepHeading
          icon={<SmartphoneIcon aria-hidden />}
          title="Two-factor authentication"
          description="Enter the 6-digit code from your authenticator app."
        />
        <Field
          control={form.control}
          name="code"
          label="Authenticator code"
          render={(field) => (
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              className="font-mono tracking-widest"
              {...field}
            />
          )}
        />
        <FormError message={submit.error} />
        <SubmitButton pending={submit.pending}>Verify</SubmitButton>
        <Button
          type="button"
          variant="link"
          className="h-auto justify-self-start p-0"
          onClick={onUseRecovery}
        >
          Lost your phone? Use a recovery code
        </Button>
      </form>
    </Form>
  );
}

function RecoveryCodeStep({
  email,
  onResult,
  onBack,
  onUseAuthenticator,
}: StepProps & { email: string; onBack: () => void; onUseAuthenticator: () => void }) {
  const form = useForm<z.input<typeof recoverySchema>>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { code: "" },
  });
  const submit = useSubmit(form, async ({ code }) => {
    onResult(await submitTotp({ email, recoveryCode: code.trim() }), email);
  });

  return (
    <Form {...form}>
      <form onSubmit={submit.handler} noValidate className="grid gap-4">
        <BackButton onClick={onBack} />
        <StepHeading
          icon={<KeyRoundIcon aria-hidden />}
          title="Use a recovery code"
          description="Enter one of the recovery codes you saved when setting up two-factor authentication. Each code works once."
        />
        <Field
          control={form.control}
          name="code"
          label="Recovery code"
          render={(field) => (
            <Input
              autoComplete="off"
              autoFocus
              spellCheck={false}
              className="font-mono tracking-wider"
              {...field}
            />
          )}
        />
        <FormError message={submit.error} />
        <SubmitButton pending={submit.pending}>Verify</SubmitButton>
        <Button
          type="button"
          variant="link"
          className="h-auto justify-self-start p-0"
          onClick={onUseAuthenticator}
        >
          Use your authenticator app instead
        </Button>
      </form>
    </Form>
  );
}

const passwordResetSchema = z
  .object({
    temporaryPassword: z.string().min(1, "Enter the temporary password from your invitation"),
    newPassword: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(128)
      .refine(
        (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
        "Mix upper- and lower-case letters and numbers",
      ),
    confirmNewPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmNewPassword, {
    path: ["confirmNewPassword"],
    message: "Passwords do not match",
  })
  .refine((v) => v.newPassword !== v.temporaryPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the temporary one",
  });

function PasswordResetStep({
  email,
  onBack,
  onDone,
}: {
  email: string;
  onBack: () => void;
  onDone: (state: { onboardingToken: string; needs2FA: boolean; needsPhone: boolean }) => void;
}) {
  const form = useForm<z.input<typeof passwordResetSchema>>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: { temporaryPassword: "", newPassword: "", confirmNewPassword: "" },
  });
  const submit = useSubmit(form, async (values) => {
    onDone(await completeForcedPasswordReset({ email, ...values }));
  });

  return (
    <Form {...form}>
      <form onSubmit={submit.handler} noValidate className="grid gap-4">
        <BackButton onClick={onBack} />
        <StepHeading
          title="Set your password"
          description="Your account was created with a temporary password. Replace it before continuing."
        />
        <Field
          control={form.control}
          name="temporaryPassword"
          label="Temporary password"
          render={(field) => (
            <Input type="password" autoComplete="current-password" autoFocus {...field} />
          )}
        />
        <Field
          control={form.control}
          name="newPassword"
          label="New password"
          hint="At least 12 characters, mixing upper- and lower-case letters and numbers."
          render={(field) => <Input type="password" autoComplete="new-password" {...field} />}
        />
        <Field
          control={form.control}
          name="confirmNewPassword"
          label="Confirm new password"
          render={(field) => <Input type="password" autoComplete="new-password" {...field} />}
        />
        <FormError message={submit.error} />
        <SubmitButton pending={submit.pending}>Save password</SubmitButton>
      </form>
    </Form>
  );
}

function OnboardingStep({
  step,
  onUpdate,
  onComplete,
}: {
  step: Extract<Step, { kind: "onboarding" }>;
  onUpdate: (step: Step) => void;
  onComplete: () => void;
}) {
  const enrolment = useQuery({
    queryKey: ["onboarding-totp", step.email],
    queryFn: () => startOnboardingTotp(step.token),
    enabled: step.needs2FA,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  if (step.needs2FA) {
    return (
      <div className="grid gap-4">
        <StepHeading
          title="Set up two-factor authentication"
          description="Two-factor authentication is required for every administrator."
        />
        {enrolment.isPending && (
          <LoaderCircleIcon
            className="size-5 animate-spin justify-self-center text-muted-foreground"
            aria-hidden
          />
        )}
        {enrolment.isError && <FormError message={getUserMessage(enrolment.error)} />}
        {enrolment.data && (
          <TotpEnrolment
            otpauth={enrolment.data.otpauth}
            secret={enrolment.data.secret}
            submitLabel="Verify"
            onVerify={async (code) => {
              const { onboardingComplete } = await confirmOnboardingTotp(step.token, code);
              if (onboardingComplete || !step.needsPhone) onComplete();
              else onUpdate({ ...step, needs2FA: false });
            }}
          />
        )}
      </div>
    );
  }

  return <PhoneStep token={step.token} onComplete={onComplete} />;
}

const phoneSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Enter a phone number with country code, e.g. +2348012345678"),
});
const otpSchema = z.object({ otp: z.string().trim().min(4, "Enter the code sent by SMS") });

function PhoneStep({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const phoneForm = useForm<z.input<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phoneNumber: "" },
  });
  const otpForm = useForm<z.input<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });

  const send = useSubmit(phoneForm, async ({ phoneNumber }) => {
    await sendOnboardingPhoneOtp(token, phoneNumber.trim());
    setSentTo(phoneNumber.trim());
  });
  const verify = useSubmit(otpForm, async ({ otp }) => {
    await verifyOnboardingPhoneOtp(token, otp.trim());
    onComplete();
  });

  return (
    <div className="grid gap-4">
      <StepHeading
        title="Add a phone number"
        description="Used to verify sign-ins from new devices. It is shown masked to other administrators."
      />
      {!sentTo ? (
        <Form {...phoneForm}>
          <form onSubmit={send.handler} noValidate className="grid gap-4">
            <Field
              control={phoneForm.control}
              name="phoneNumber"
              label="Mobile number"
              render={(field) => <Input type="tel" autoComplete="tel" autoFocus {...field} />}
            />
            <FormError message={send.error} />
            <SubmitButton pending={send.pending}>Send code</SubmitButton>
          </form>
        </Form>
      ) : (
        <Form {...otpForm}>
          <form onSubmit={verify.handler} noValidate className="grid gap-4">
            <p className="text-sm text-muted-foreground">Enter the code sent to {sentTo}.</p>
            <Field
              control={otpForm.control}
              name="otp"
              label="SMS code"
              render={(field) => (
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className="font-mono tracking-widest"
                  {...field}
                />
              )}
            />
            <FormError message={verify.error} />
            <SubmitButton pending={verify.pending}>Verify</SubmitButton>
            <Button
              type="button"
              variant="link"
              className="h-auto justify-self-start p-0"
              onClick={() => {
                setSentTo(null);
              }}
            >
              Use a different number
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}

const deviceSchema = z.object({
  emailCode: z.string().trim().min(4, "Enter the code from your email"),
  phoneOtp: z.string().trim().min(4, "Enter the SMS code"),
  twoFaCode: z
    .string()
    .trim()
    .regex(/^(\d{6})?$/, "Enter the 6-digit code")
    .optional(),
});

function DeviceChallengeStep({
  step,
  onResult,
  onBack,
}: StepProps & { step: Extract<Step, { kind: "device-challenge" }>; onBack: () => void }) {
  const [smsSent, setSmsSent] = useState<string | null>(null);
  const form = useForm<z.input<typeof deviceSchema>>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { emailCode: "", phoneOtp: "", twoFaCode: "" },
  });
  const sms = useMutation({
    mutationFn: () => sendDeviceChallengeSms(step.challengeToken),
    onSuccess: (result) => {
      setSmsSent(result.message);
    },
  });
  const submit = useSubmit(form, async (values) => {
    const { token } = await verifyDeviceChallenge(step.challengeToken, {
      emailCode: values.emailCode.trim(),
      phoneOtp: values.phoneOtp.trim(),
      twoFaCode: values.twoFaCode?.trim() || undefined,
    });
    onResult({ kind: "authenticated", token }, step.email);
  });

  return (
    <Form {...form}>
      <form onSubmit={submit.handler} noValidate className="grid gap-4">
        <BackButton onClick={onBack} />
        <StepHeading
          icon={<ShieldAlertIcon className="text-warning" aria-hidden />}
          title="Verify this device"
          description="This browser isn't one of your trusted devices. Confirm it's you with the code we emailed and an SMS code."
        />
        <Field
          control={form.control}
          name="emailCode"
          label="Email code"
          render={(field) => (
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="font-mono tracking-widest"
              {...field}
            />
          )}
        />
        <div className="grid gap-1.5">
          <Field
            control={form.control}
            name="phoneOtp"
            label="SMS code"
            render={(field) => (
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                className="font-mono tracking-widest"
                {...field}
              />
            )}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                sms.mutate();
              }}
              disabled={sms.isPending}
            >
              {sms.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
              {smsSent ? "Resend SMS" : "Send SMS code"}
            </Button>
            <span aria-live="polite">{sms.isError ? getUserMessage(sms.error) : smsSent}</span>
          </div>
        </div>
        <Field
          control={form.control}
          name="twoFaCode"
          label="Authenticator code"
          hint="Required if two-factor authentication is enabled on your account."
          render={(field) => (
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="font-mono tracking-widest"
              {...field}
            />
          )}
        />
        <FormError message={submit.error} />
        <SubmitButton pending={submit.pending}>Verify device</SubmitButton>
      </form>
    </Form>
  );
}

/* ─── Building blocks ────────────────────────────────────────────────────── */

interface SubmitState {
  handler: (event: SubmitEvent<HTMLFormElement>) => void;
  pending: boolean;
  error: string | null;
}

/** Submits a step, surfacing API failures as a form-level message with the request reference. */
function useSubmit<TIn extends FieldValues, TOut>(
  form: UseFormReturn<TIn, unknown, TOut>,
  action: (values: TOut) => Promise<void>,
): SubmitState {
  const [error, setError] = useState<string | null>(null);
  const handler = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await action(values);
    } catch (caught) {
      const appError = toAppError(caught);
      setError(
        appError.requestId
          ? `${appError.userMessage} (Reference ${appError.requestId})`
          : appError.userMessage,
      );
    }
  });
  return {
    handler: (event) => void handler(event),
    pending: form.formState.isSubmitting,
    error,
  };
}

function Field<TIn extends FieldValues, TOut>({
  control,
  name,
  label,
  hint,
  render,
}: {
  control: Control<TIn, unknown, TOut>;
  name: Path<TIn>;
  label: string;
  hint?: string;
  render: (field: ControllerRenderProps<TIn, Path<TIn>>) => ReactNode;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>{render(field)}</FormControl>
          {hint && <FormDescription className="text-xs">{hint}</FormDescription>}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/25 bg-destructive/6 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 w-fit text-muted-foreground"
      onClick={onClick}
    >
      <ArrowLeftIcon aria-hidden />
      Start over
    </Button>
  );
}

function StepHeading({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-1">
      <h2 className="flex items-center gap-2 text-base font-semibold [&_svg]:size-4">
        {icon}
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
