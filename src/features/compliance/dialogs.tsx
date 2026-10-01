"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  Field,
  FormDialog,
  TwoFactorField,
  validateTwoFactor,
} from "@/components/confirm/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { humanizeEnum } from "@/lib/format";

import {
  assessReport,
  type ComplianceProfile,
  type Disposition,
  dispositionAlert,
  DISPOSITIONS,
  fileReport,
  PEP_STATUSES,
  raiseReport,
  REPORT_TYPES,
  RISK_RATINGS,
  SOURCES_OF_FUNDS,
  updateComplianceProfile,
} from "./api";
import { ALERT_STATUS } from "./labels";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useRefreshCompliance() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["compliance"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);
}

function Choice<V extends string>({
  id,
  value,
  options,
  onChange,
  label,
}: {
  id: string;
  value: V | "";
  options: readonly V[];
  onChange: (value: V) => void;
  label: (value: V) => string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        onChange(next as V);
      }}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const trimmed = (value: string, min: number, what: string) =>
  value.trim().length >= min ? null : `${what} must be at least ${min} characters.`;

/** Records the outcome and reasoning of an alert review. */
export function DispositionDialog({ alertId, ...props }: DialogProps & { alertId: string }) {
  const refresh = useRefreshCompliance();
  const [status, setStatus] = useState<Disposition | "">("");
  const [note, setNote] = useState("");
  return (
    <FormDialog
      {...props}
      title="Record review outcome"
      description="The policy requires the reasoning, not only the outcome. Recorded in the audit log."
      submitLabel="Save outcome"
      validate={() => (status ? trimmed(note, 10, "The note") : "Choose an outcome.")}
      onSubmit={async () => {
        await dispositionAlert(alertId, { status: status as Disposition, note: note.trim() });
        toast.success("Alert updated");
        await refresh();
      }}
    >
      <Field id="disposition-status" label="Outcome">
        <Choice
          id="disposition-status"
          value={status}
          options={DISPOSITIONS}
          onChange={setStatus}
          label={(v) => ALERT_STATUS[v].label}
        />
      </Field>
      <Field id="disposition-note" label="Review note" hint="At least 10 characters.">
        <Textarea
          id="disposition-note"
          value={note}
          maxLength={2000}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

/** Raises a suspicious activity report for MLRO assessment, optionally binding alerts to it. */
export function RaiseReportDialog({
  userId,
  customer,
  alertIds,
  ...props
}: DialogProps & { userId: string; customer: string; alertIds: string[] }) {
  const refresh = useRefreshCompliance();
  const [reportType, setReportType] = useState<(typeof REPORT_TYPES)[number]>("STR");
  const [grounds, setGrounds] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <FormDialog
      {...props}
      title={`Raise report: ${customer}`}
      description={
        alertIds.length > 0
          ? `The report goes to the MLRO for assessment. ${alertIds.length} alert(s) will be bound to it and marked reported.`
          : "The report goes to the MLRO for assessment."
      }
      submitLabel="Raise report"
      tone="danger"
      validate={() =>
        trimmed(grounds, 20, "The grounds for suspicion") ??
        (amount && !/^\d+(\.\d{1,2})?$/.test(amount.trim())
          ? "Enter the amount as a number, e.g. 250000.00."
          : null)
      }
      onSubmit={async () => {
        const result = await raiseReport({
          userId,
          reportType,
          suspicionGrounds: grounds.trim(),
          amountInvolved: amount.trim() || undefined,
          alertIds,
        });
        toast.success(result.message || "Report raised");
        await refresh();
      }}
    >
      <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
        Never tell the customer that a report exists or is being considered. Disclosure is an
        offence.
      </p>
      <Field id="report-type" label="Report type">
        <Choice
          id="report-type"
          value={reportType}
          options={REPORT_TYPES}
          onChange={setReportType}
          label={(v) =>
            v === "STR" ? "Suspicious transaction report" : "Currency transaction report"
          }
        />
      </Field>
      <Field id="report-grounds" label="Grounds for suspicion" hint="At least 20 characters.">
        <Textarea
          id="report-grounds"
          value={grounds}
          maxLength={5000}
          onChange={(e) => {
            setGrounds(e.target.value);
          }}
        />
      </Field>
      <Field id="report-amount" label="Amount involved (₦, optional)">
        <Input
          id="report-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

/** The MLRO decision on a raised report. */
export function AssessReportDialog({ reportId, ...props }: DialogProps & { reportId: string }) {
  const refresh = useRefreshCompliance();
  const [decision, setDecision] = useState<"REPORT" | "DO_NOT_REPORT" | "">("");
  const [rationale, setRationale] = useState("");
  return (
    <FormDialog
      {...props}
      title="Assess report"
      description="The rationale is kept for reports not filed as well as those filed."
      submitLabel="Record decision"
      validate={() => (decision ? trimmed(rationale, 20, "The rationale") : "Choose a decision.")}
      onSubmit={async () => {
        await assessReport(reportId, {
          decision: decision as "REPORT" | "DO_NOT_REPORT",
          rationale: rationale.trim(),
        });
        toast.success("Assessment recorded");
        await refresh();
      }}
    >
      <Field id="assess-decision" label="Decision">
        <Choice
          id="assess-decision"
          value={decision}
          options={["REPORT", "DO_NOT_REPORT"] as const}
          onChange={setDecision}
          label={(v) => (v === "REPORT" ? "Report to the NFIU" : "Do not report")}
        />
      </Field>
      <Field id="assess-rationale" label="Rationale" hint="At least 20 characters.">
        <Textarea
          id="assess-rationale"
          value={rationale}
          maxLength={5000}
          onChange={(e) => {
            setRationale(e.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

/** Records that a report was filed, with the NFIU acknowledgement. */
export function FileReportDialog({ reportId, ...props }: DialogProps & { reportId: string }) {
  const refresh = useRefreshCompliance();
  const [nfiuReference, setNfiuReference] = useState("");
  const [note, setNote] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  return (
    <FormDialog
      {...props}
      title="Record filing"
      description="Enter the acknowledgement reference the NFIU returned. Filing happens outside this console."
      submitLabel="Record as filed"
      validate={() =>
        nfiuReference.trim() ? validateTwoFactor(twoFACode) : "Enter the NFIU reference."
      }
      onSubmit={async () => {
        await fileReport(reportId, {
          nfiuReference: nfiuReference.trim(),
          filingNote: note.trim() || undefined,
          twoFACode: twoFACode.trim(),
        });
        toast.success("Recorded as filed");
        await refresh();
      }}
    >
      <Field id="file-ref" label="NFIU reference">
        <Input
          id="file-ref"
          value={nfiuReference}
          onChange={(e) => {
            setNfiuReference(e.target.value);
          }}
        />
      </Field>
      <Field id="file-note" label="Filing note (optional)">
        <Textarea
          id="file-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </Field>
      <TwoFactorField id="file-2fa" value={twoFACode} onChange={setTwoFACode} />
    </FormDialog>
  );
}

/** Risk rating, PEP status and declared source of funds. */
export function ProfileDialog({
  userId,
  profile,
  ...props
}: DialogProps & { userId: string; profile: ComplianceProfile }) {
  const refresh = useRefreshCompliance();
  const [riskRating, setRiskRating] = useState(profile.riskRating as (typeof RISK_RATINGS)[number]);
  const [riskRationale, setRiskRationale] = useState("");
  const [pepStatus, setPepStatus] = useState(profile.pepStatus as (typeof PEP_STATUSES)[number]);
  const [pepNote, setPepNote] = useState(profile.pepNote ?? "");
  const [sourceOfFunds, setSourceOfFunds] = useState<(typeof SOURCES_OF_FUNDS)[number] | "">(
    (profile.sourceOfFunds as (typeof SOURCES_OF_FUNDS)[number] | null) ?? "",
  );
  const [occupation, setOccupation] = useState(profile.occupation ?? "");
  const [twoFACode, setTwoFACode] = useState("");
  const ratingChanged = riskRating !== profile.riskRating;
  const pepChanged = pepStatus !== profile.pepStatus;

  return (
    <FormDialog
      {...props}
      title="Edit compliance profile"
      description="Rating and PEP changes are recorded in the audit log. Marking someone a PEP sets their rating to high and requires enhanced due diligence."
      submitLabel="Save profile"
      validate={() =>
        (ratingChanged ? trimmed(riskRationale, 10, "The rating rationale") : null) ??
        validateTwoFactor(twoFACode)
      }
      onSubmit={async () => {
        await updateComplianceProfile(userId, {
          ...(ratingChanged ? { riskRating, riskRationale: riskRationale.trim() } : {}),
          ...(pepChanged || pepNote !== (profile.pepNote ?? "")
            ? { pepStatus, pepNote: pepNote.trim() || undefined }
            : {}),
          ...(sourceOfFunds ? { sourceOfFunds } : {}),
          occupation: occupation.trim() || undefined,
          twoFACode: twoFACode.trim(),
        });
        toast.success("Compliance profile updated");
        await refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="profile-rating" label="Risk rating">
          <Choice
            id="profile-rating"
            value={riskRating}
            options={RISK_RATINGS}
            onChange={setRiskRating}
            label={humanizeEnum}
          />
        </Field>
        <Field id="profile-pep" label="PEP status">
          <Choice
            id="profile-pep"
            value={pepStatus}
            options={PEP_STATUSES}
            onChange={setPepStatus}
            label={(v) =>
              v === "PEP" ? "PEP" : v === "PEP_ASSOCIATE" ? "PEP associate" : humanizeEnum(v)
            }
          />
        </Field>
      </div>
      {ratingChanged && (
        <Field id="profile-rationale" label="Why the rating changes" hint="At least 10 characters.">
          <Textarea
            id="profile-rationale"
            value={riskRationale}
            onChange={(e) => {
              setRiskRationale(e.target.value);
            }}
          />
        </Field>
      )}
      <Field id="profile-pep-note" label="PEP note (optional)">
        <Input
          id="profile-pep-note"
          value={pepNote}
          onChange={(e) => {
            setPepNote(e.target.value);
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="profile-sof" label="Source of funds">
          <Choice
            id="profile-sof"
            value={sourceOfFunds}
            options={SOURCES_OF_FUNDS}
            onChange={setSourceOfFunds}
            label={humanizeEnum}
          />
        </Field>
        <Field id="profile-occupation" label="Occupation">
          <Input
            id="profile-occupation"
            value={occupation}
            onChange={(e) => {
              setOccupation(e.target.value);
            }}
          />
        </Field>
      </div>
      <TwoFactorField id="profile-2fa" value={twoFACode} onChange={setTwoFACode} />
    </FormDialog>
  );
}
