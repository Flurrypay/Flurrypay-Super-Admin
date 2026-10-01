"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { Amount } from "@/components/format/amount";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPermission } from "@/features/auth/admin-context";

import { fetchRates, RATE_LIMITS, type Rates, type RatesUpdate, updateRates } from "./api";

function Percent({ value }: { value: string | null }) {
  return <span className="tabular-nums">{value === null ? "—" : `${value}%`}</span>;
}

/** Customer pricing: USD rates, trade markups and the swap fee. */
export function RatesView() {
  const canEdit = useHasPermission("settings.manage");
  const [editing, setEditing] = useState(false);
  const rates = useQuery({ queryKey: ["rates"], queryFn: ({ signal }) => fetchRates(signal) });

  if (rates.isPending) return <Skeleton className="h-72" />;
  if (rates.isError) {
    return (
      <ErrorState error={rates.error} subject="the rates" onRetry={() => void rates.refetch()} />
    );
  }
  const r = rates.data;
  const live = r.liveQuidaxRates?.usdtNgn;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end gap-2">
        <Freshness
          updatedAt={rates.dataUpdatedAt}
          isFetching={rates.isFetching}
          onRefresh={() => void rates.refetch()}
        />
        {canEdit && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(true);
            }}
          >
            <PencilIcon aria-hidden />
            Change rates
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection title="Current pricing">
          <DetailList
            items={[
              {
                label: "Buy rate",
                value: <Amount value={r.buyRate} currency="NGN" />,
                hint: "Naira per 1 USD when customers buy crypto.",
              },
              {
                label: "Sell rate",
                value: <Amount value={r.sellRate} currency="NGN" />,
                hint: "Naira per 1 USD when customers sell crypto.",
              },
              { label: "Buy markup", value: <Percent value={r.buyMarkupPercent} /> },
              { label: "Sell markdown", value: <Percent value={r.sellMarkdownPercent} /> },
              { label: "Swap fee", value: <Percent value={r.swapFeePercent} /> },
            ]}
          />
        </DetailSection>
        <DetailSection title="Market reference (Quidax USDT/NGN)">
          {live ? (
            <DetailList
              items={[
                { label: "Last", value: <Amount value={live.last} currency="NGN" /> },
                { label: "Best buy", value: <Amount value={live.buy} currency="NGN" /> },
                { label: "Best sell", value: <Amount value={live.sell} currency="NGN" /> },
                {
                  label: "24 h range",
                  value: (
                    <span>
                      <Amount value={live.low} currency="NGN" className="font-normal" /> –{" "}
                      <Amount value={live.high} currency="NGN" className="font-normal" />
                    </span>
                  ),
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              The market reference is unavailable right now. The API could not reach Quidax.
            </p>
          )}
        </DetailSection>
      </div>
      {canEdit && <RatesDialog open={editing} onOpenChange={setEditing} rates={r} />}
    </div>
  );
}

type Draft = Record<
  "buyRate" | "sellRate" | "buyMarkupPercent" | "sellMarkdownPercent" | "swapFeePercent",
  string
>;

function RatesDialog({
  rates,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rates: Rates;
}) {
  const queryClient = useQueryClient();
  const initial: Draft = {
    buyRate: rates.buyRate ?? "",
    sellRate: rates.sellRate ?? "",
    buyMarkupPercent: rates.buyMarkupPercent ?? "",
    sellMarkdownPercent: rates.sellMarkdownPercent ?? "",
    swapFeePercent: rates.swapFeePercent ?? "",
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [code, setCode] = useState("");
  const changed = (Object.keys(draft) as (keyof Draft)[]).filter(
    (key) => draft[key].trim() !== initial[key],
  );

  const set = (key: keyof Draft) => (event: { target: { value: string } }) => {
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  };

  function validate(): string | null {
    if (changed.length === 0) return "Nothing has changed.";
    for (const key of changed) {
      const value = Number(draft[key]);
      if (!draft[key].trim() || !Number.isFinite(value)) return "Enter numbers only.";
      if ((key === "buyRate" || key === "sellRate") && value <= 0) {
        return "Rates must be greater than zero.";
      }
      if (key in RATE_LIMITS) {
        const limit = RATE_LIMITS[key as keyof typeof RATE_LIMITS];
        if (value < limit.min || value > limit.max) {
          return `${key === "swapFeePercent" ? "The swap fee" : "Markups"} must be between ${limit.min}% and ${limit.max}%.`;
        }
      }
    }
    if (!/^\d{6}$/.test(code.trim())) return "Enter the 6-digit code from your authenticator app.";
    return null;
  }

  return (
    <FormDialog
      {...props}
      title="Change rates"
      description="New pricing applies to the next trade, and every customer is notified of the change. Recorded in the audit log with the previous values."
      submitLabel={`Apply ${changed.length || ""} change${changed.length === 1 ? "" : "s"}`}
      tone="danger"
      validate={validate}
      onSubmit={async () => {
        const input: RatesUpdate = { twoFACode: code.trim() };
        for (const key of changed) input[key] = Number(draft[key]);
        await updateRates(input);
        toast.success("Rates updated");
        setCode("");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["rates"] }),
          queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
        ]);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rate-buy" label="Buy rate (₦ per USD)">
          <Input
            id="rate-buy"
            inputMode="decimal"
            value={draft.buyRate}
            onChange={set("buyRate")}
          />
        </Field>
        <Field id="rate-sell" label="Sell rate (₦ per USD)">
          <Input
            id="rate-sell"
            inputMode="decimal"
            value={draft.sellRate}
            onChange={set("sellRate")}
          />
        </Field>
        <Field id="rate-markup" label="Buy markup (%)" hint="0 to 20.">
          <Input
            id="rate-markup"
            inputMode="decimal"
            value={draft.buyMarkupPercent}
            onChange={set("buyMarkupPercent")}
          />
        </Field>
        <Field id="rate-markdown" label="Sell markdown (%)" hint="0 to 20.">
          <Input
            id="rate-markdown"
            inputMode="decimal"
            value={draft.sellMarkdownPercent}
            onChange={set("sellMarkdownPercent")}
          />
        </Field>
        <Field id="rate-swap" label="Swap fee (%)" hint="0 to 1.">
          <Input
            id="rate-swap"
            inputMode="decimal"
            value={draft.swapFeePercent}
            onChange={set("swapFeePercent")}
          />
        </Field>
        <Field id="rate-2fa" label="Authenticator code">
          <Input
            id="rate-2fa"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="font-mono tracking-widest"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
