"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  clearTransactionFlag,
  FLAG_REASONS,
  FLAG_SEVERITIES,
  type FlagReason,
  type FlagSeverity,
  flagTransaction,
  type Transaction,
} from "./api";
import {
  FLAG_REASON_HINT,
  FLAG_REASON_LABEL,
  FLAG_SEVERITY_HINT,
  FLAG_SEVERITY_LABEL,
} from "./labels";

/** Matches the API's minimum. Enforced here too so the refusal is a hint, not an error. */
const MIN_TEXT = 10;

/**
 * Invalidate everything a flag change is visible in.
 *
 * The list (badge and filter), the open sheet's row, the flag summary, and the
 * audit log — which gains an entry for every flag raised or cleared, and is a
 * screen somebody may well have open beside this one.
 */
function useFlagInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["transaction-flags"] });
    void queryClient.invalidateQueries({ queryKey: ["transaction"] });
    void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };
}

export function FlagTransactionDialog({
  tx,
  open,
  onOpenChange,
}: {
  tx: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidate = useFlagInvalidation();
  const [reason, setReason] = useState<FlagReason>("SUSPECTED_FRAUD");
  const [severity, setSeverity] = useState<FlagSeverity>("MEDIUM");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () => flagTransaction(tx.id, { reason, severity, note: note.trim() }),
    onSuccess: () => {
      toast.success("Transaction flagged for review");
      setNote("");
      invalidate();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Flag for review"
      description={
        <>
          Marks this transaction for someone to look at. The customer is not told, nothing is held,
          and the transaction&apos;s status does not change. To stop the money moving, freeze it
          from Risk &amp; fraud instead.
        </>
      }
      submitLabel="Flag transaction"
      validate={() =>
        note.trim().length < MIN_TEXT
          ? `Write at least ${MIN_TEXT} characters explaining what you noticed.`
          : null
      }
      onSubmit={() => mutation.mutateAsync()}
    >
      <Field id="flag-reason" label="Reason" hint={FLAG_REASON_HINT[reason]}>
        <Select
          value={reason}
          onValueChange={(value) => {
            setReason(value as FlagReason);
          }}
        >
          <SelectTrigger id="flag-reason">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLAG_REASONS.map((value) => (
              <SelectItem key={value} value={value}>
                {FLAG_REASON_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="flag-severity" label="Severity" hint={FLAG_SEVERITY_HINT}>
        <Select
          value={severity}
          onValueChange={(value) => {
            setSeverity(value as FlagSeverity);
          }}
        >
          <SelectTrigger id="flag-severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLAG_SEVERITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {FLAG_SEVERITY_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="flag-note"
        label="What you noticed"
        hint="Read by whoever reviews this, and recorded in the audit log under your name."
      >
        <Textarea
          id="flag-note"
          rows={4}
          value={note}
          placeholder="e.g. Third transfer to the same new beneficiary in an hour, each just under ₦100,000."
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

export function ClearFlagDialog({
  tx,
  open,
  onOpenChange,
}: {
  tx: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidate = useFlagInvalidation();
  const [resolution, setResolution] = useState("");

  const mutation = useMutation({
    mutationFn: () => clearTransactionFlag(tx.id, resolution.trim()),
    onSuccess: () => {
      toast.success("Flag cleared");
      setResolution("");
      invalidate();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clear the flag"
      description={
        <>
          Closes the review. The original flag and this resolution both stay on the record, so the
          history reads as &ldquo;flagged, then checked&rdquo; rather than as though nobody ever
          looked.
        </>
      }
      submitLabel="Clear flag"
      validate={() =>
        resolution.trim().length < MIN_TEXT
          ? `Write at least ${MIN_TEXT} characters saying what you found.`
          : null
      }
      onSubmit={() => mutation.mutateAsync()}
    >
      <Field
        id="flag-resolution"
        label="What you found"
        hint="The record that this was actually checked, not just dismissed."
      >
        <Textarea
          id="flag-resolution"
          rows={4}
          value={resolution}
          placeholder="e.g. Customer produced the invoice and the recipient is their registered supplier. No further action."
          onChange={(event) => {
            setResolution(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}
