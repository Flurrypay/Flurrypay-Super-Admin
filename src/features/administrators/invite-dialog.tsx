"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon, ShieldCheckIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toAppError } from "@/lib/api/errors";
import { email } from "@/schemas";

import { AccessForm, type AccessValue } from "./access-form";
import { inviteAdministrator } from "./api";

const schema = z.object({
  firstName: z.string().trim().min(1, "Required").max(80),
  lastName: z.string().trim().min(1, "Required").max(80),
  email,
  userName: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,32}$/, "3–32 letters, numbers, dots, dashes or underscores"),
  twoFACode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});
type Values = z.input<typeof schema>;

const INITIAL_ACCESS: AccessValue = { role: "admin", permissions: [], customRoleId: null };

/**
 * Invites a staff administrator. The API creates the account with a random
 * temporary password, emails it, and forces a password change, 2FA and phone
 * setup on first sign-in.
 */
export function InviteDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<AccessValue>(INITIAL_ACCESS);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", userName: "", twoFACode: "" },
  });

  const invite = useMutation({
    mutationFn: inviteAdministrator,
    onSuccess: async (_data, input) => {
      toast.success(`Invitation sent to ${input.email}`);
      await queryClient.invalidateQueries({ queryKey: ["administrators"] });
      setOpen(false);
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await invite.mutateAsync({
        ...values,
        role: access.role,
        permissions: access.permissions,
        customRoleId: access.role === "superAdmin" ? null : access.customRoleId,
      });
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === "ADMIN_2FA_INVALID" || appError.code === "ADMIN_2FA_CODE_MISSING") {
        form.setError("twoFACode", { message: appError.userMessage });
        return;
      }
      setError(
        appError.requestId
          ? `${appError.userMessage} (Reference ${appError.requestId})`
          : appError.userMessage,
      );
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          form.reset();
          setAccess(INITIAL_ACCESS);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon aria-hidden />
          Invite administrator
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite administrator</DialogTitle>
          <DialogDescription>
            They receive a temporary password by email and must set a new password, enable
            two-factor authentication and add a phone number before they can use the console.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["firstName", "lastName"] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{name === "firstName" ? "First name" : "Last name"}</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="userName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <AccessForm value={access} onChange={setAccess} />

            <Alert tone="neutral">
              <ShieldCheckIcon aria-hidden />
              <AlertDescription>
                The temporary password does not expire and invitations cannot be revoked separately:
                remove the account if it should no longer be used.
              </AlertDescription>
            </Alert>

            <FormField
              control={form.control}
              name="twoFACode"
              render={({ field }) => (
                <FormItem className="max-w-56">
                  <FormLabel>Your authenticator code</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="font-mono tracking-widest"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/25 bg-destructive/6 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <LoaderCircleIcon className="animate-spin" aria-hidden />
                )}
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
