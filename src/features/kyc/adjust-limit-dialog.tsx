"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { Amount } from "@/components/format/amount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { overrideUserLimit } from "./api";

interface AdjustLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  customerName: string;
  currentLevel: number;
  currentLimit: number | string | null;
}

const PRESET_LIMITS = [
  { label: "₦1,000,000", value: 1_000_000 },
  { label: "₦2,000,000", value: 2_000_000 },
  { label: "₦5,000,000", value: 5_000_000 },
  { label: "₦10,000,000", value: 10_000_000 },
  { label: "₦20,000,000", value: 20_000_000 },
  { label: "₦50,000,000", value: 50_000_000 },
];

export function AdjustLimitDialog({
  open,
  onOpenChange,
  userId,
  customerName,
  currentLevel,
  currentLimit,
}: AdjustLimitDialogProps) {
  const queryClient = useQueryClient();
  const [limitStr, setLimitStr] = useState<string>(String(currentLimit || 1_000_000));
  const [targetLevel, setTargetLevel] = useState<string>("keep");
  const [note, setNote] = useState<string>("");
  const [twoFACode, setTwoFACode] = useState<string>("");

  const parsedLimit = Number(limitStr.replace(/[^0-9.]/g, ""));

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const kycLevel = targetLevel === "keep" ? undefined : (Number(targetLevel) as 0 | 1 | 2 | 3);
      return overrideUserLimit({
        userId,
        dailyLimit: parsedLimit,
        kycLevel,
        note: note.trim(),
        twoFACode: twoFACode.trim(),
      });
    },
    onSuccess: async () => {
      toast.success(
        `Withdrawal limit updated to ₦${parsedLimit.toLocaleString("en-NG")} for ${customerName}`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-kyc", userId] }),
        queryClient.invalidateQueries({ queryKey: ["user", userId] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
      ]);
      onOpenChange(false);
    },
  });

  function validate(): string | null {
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return "Please enter a valid daily withdrawal limit greater than zero.";
    }
    if (!note.trim() || note.trim().length < 5) {
      return "Please provide a reason / note for the limit change (minimum 5 characters).";
    }
    if (!twoFACode.trim() || twoFACode.trim().length !== 6) {
      return "A valid 6-digit authenticator code (2FA) is required for Super Admin overrides.";
    }
    return null;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust user withdrawal limit"
      description={
        <span>
          Set a custom daily withdrawal limit for{" "}
          <strong className="font-semibold text-foreground">{customerName}</strong>. You may also
          upgrade their KYC tier.
        </span>
      }
      submitLabel="Apply limit override"
      validate={validate}
      onSubmit={() => adjustMutation.mutateAsync()}
    >
      <div className="grid gap-4 py-2">
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-xs">
          <div>
            <span className="text-muted-foreground">Current limit:</span>{" "}
            <span className="font-semibold">
              <Amount value={currentLimit} currency="NGN" />
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Current tier:</span>{" "}
            <span className="font-semibold">Level {currentLevel}</span>
          </div>
        </div>

        <Field
          id="dailyLimit"
          label="New daily withdrawal limit (NGN)"
          hint="Pick a preset or type any custom limit."
        >
          <div className="grid gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">
                ₦
              </span>
              <Input
                id="dailyLimit"
                type="number"
                min={0}
                step={50000}
                value={limitStr}
                onChange={(e) => {
                  setLimitStr(e.target.value);
                }}
                className="pl-7"
                placeholder="e.g. 5,000,000"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_LIMITS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  size="sm"
                  variant={parsedLimit === preset.value ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => {
                    setLimitStr(String(preset.value));
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </Field>

        <Field
          id="targetLevel"
          label="Target KYC tier"
          hint="Optional: elevate this account's verified tier."
        >
          <Select value={targetLevel} onValueChange={setTargetLevel}>
            <SelectTrigger id="targetLevel">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">Keep current level (Level {currentLevel})</SelectItem>
              <SelectItem value="1">Level 1 · BVN verified (₦200,000 default)</SelectItem>
              <SelectItem value="2">Level 2 · NIN verified (₦1,000,000 default)</SelectItem>
              <SelectItem value="3">Level 3 · Fully verified (₦50,000,000 default)</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="reasonNote"
          label="Reason for override"
          hint="Stored in the audit log and customer compliance history."
        >
          <Textarea
            id="reasonNote"
            rows={2}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            placeholder="e.g. Approved high-volume trader limit increase to ₦10M."
          />
        </Field>

        <Field
          id="twoFACode"
          label={
            <span className="flex items-center gap-1.5">
              <ShieldCheckIcon className="size-4 text-primary" />
              <span>Super Admin 2FA Code</span>
            </span>
          }
          hint="6-digit code from your authenticator app."
        >
          <Input
            id="twoFACode"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={twoFACode}
            onChange={(e) => {
              setTwoFACode(e.target.value.replace(/[^0-9]/g, ""));
            }}
            placeholder="123456"
            className="tracking-widest"
          />
        </Field>
      </div>
    </FormDialog>
  );
}
