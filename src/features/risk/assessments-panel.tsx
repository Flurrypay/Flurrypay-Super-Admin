"use client";

import { useQuery } from "@tanstack/react-query";
import { ActivityIcon, ScaleIcon, UserSearchIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DetailList } from "@/components/detail/detail-list";
import { SelectFilter } from "@/components/filters/select-filter";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHasPermission } from "@/features/auth/admin-context";
import { formatAmount, humanizeEnum } from "@/lib/format";

import {
  type AssessmentQuery,
  ENGINE_RULES,
  fetchAssessments,
  fetchUserRisk,
  INTERVENING_ACTIONS,
  RISK_ACTIONS,
  type RiskActionName,
  type RiskAssessment,
} from "./monitoring-api";

/**
 * What the engine decided, and on what grounds.
 *
 * The score on its own is not reviewable — "82, high" tells an investigator
 * nothing they can check, argue with or write down. So the row is the summary
 * and the drawer is the argument: each rule that fired, the points it carried,
 * the sentence the rule wrote about what it saw, and the customer's own
 * baseline next to the amount, since "large" only means anything relative to
 * what this account normally does.
 */

const ACTION_TONE: Record<string, "neutral" | "info" | "warning" | "danger" | "success"> = {
  ALLOW: "neutral",
  ALLOW_MONITORED: "info",
  STEP_UP: "warning",
  HOLD_TRANSACTION: "warning",
  RESTRICT_OUTBOUND: "danger",
  FREEZE_ACCOUNT: "danger",
};

/**
 * Score bands as the engine applies them (api riskEngine.service.ts —
 * SCORE_STEP_UP 40, SCORE_HOLD 60, SCORE_FREEZE 85). Shown as a label so the
 * number is never the only thing on screen; colour alone is not a signal.
 */
function scoreBand(score: number): {
  label: string;
  tone: "neutral" | "info" | "warning" | "danger";
} {
  if (score >= 85) return { label: "Critical", tone: "danger" };
  if (score >= 60) return { label: "High", tone: "warning" };
  if (score >= 40) return { label: "Elevated", tone: "info" };
  return { label: "Normal", tone: "neutral" };
}

/** Evidence values are whatever the rule recorded; render them without guessing. */
function formatEvidence(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

function personName(a: RiskAssessment): string {
  const name = [a.user?.firstName, a.user?.lastName].filter(Boolean).join(" ").trim();
  return name || a.user?.userName || a.user?.email || a.userId;
}

export function AssessmentsPanel() {
  const canViewUsers = useHasPermission("users.view");
  const [filters, setFilters] = useState<{
    action: RiskActionName | null;
    rule: string | null;
    minScore: number | null;
  }>({ action: null, rule: null, minScore: null });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<RiskAssessment | null>(null);

  const query: AssessmentQuery = { ...filters, page, limit: 50 };
  const result = useQuery({
    queryKey: ["risk", "assessments", query],
    queryFn: ({ signal }) => fetchAssessments(query, signal),
  });
  const rows = result.data?.rows ?? [];

  function patch(next: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }

  const columns: DataColumn<RiskAssessment>[] = [
    {
      id: "score",
      header: "Score",
      required: true,
      align: "right",
      description: "Sum of the points carried by every rule that fired on this event.",
      sortKey: "riskScore",
      sortValue: (a) => a.riskScore,
      cell: (a) => {
        const band = scoreBand(a.riskScore);
        return (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium tabular-nums">{a.riskScore}</span>
            <Badge tone={band.tone}>{band.label}</Badge>
          </span>
        );
      },
      exportValue: (a) => a.riskScore,
    },
    {
      id: "action",
      header: "Decision",
      description:
        "What the engine did. Allow and Allow-monitored are recorded but not intervening.",
      cell: (a) => (
        <Badge tone={ACTION_TONE[a.action] ?? "neutral"}>{humanizeEnum(a.action)}</Badge>
      ),
      exportValue: (a) => a.action,
    },
    {
      id: "signals",
      header: "Rules fired",
      cell: (a) =>
        a.signals.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <span className="grid leading-tight">
            <span className="text-xs">{humanizeEnum(a.signals[0]?.rule ?? "")}</span>
            {a.signals.length > 1 && (
              <span className="text-xs text-muted-foreground">+{a.signals.length - 1} more</span>
            )}
          </span>
        ),
      exportValue: (a) => a.signals.map((s) => s.rule).join(" | "),
    },
    {
      id: "customer",
      header: "Customer",
      sensitive: true,
      cell: (a) =>
        canViewUsers ? (
          <Link href={`/users/${a.userId}`} className="truncate hover:underline">
            {personName(a)}
          </Link>
        ) : (
          <span className="truncate">{personName(a)}</span>
        ),
      exportValue: (a) => personName(a),
    },
    {
      id: "eventType",
      header: "Event",
      priority: "secondary",
      cell: (a) => humanizeEnum(a.eventType),
      exportValue: (a) => a.eventType,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      priority: "secondary",
      cell: (a) => (a.amountNaira ? <Amount value={a.amountNaira} currency="NGN" /> : "—"),
      exportValue: (a) => a.amountNaira,
    },
    {
      id: "createdAt",
      header: "Assessed",
      priority: "tertiary",
      sortKey: "createdAt",
      sortValue: (a) => a.createdAt,
      cell: (a) => <DateTime value={a.createdAt} />,
      exportValue: (a) => a.createdAt,
    },
  ];

  const pageInfo = result.data;

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Decision"
          value={filters.action}
          options={RISK_ACTIONS.map((value) => ({ value, label: humanizeEnum(value) }))}
          onChange={(action) => {
            patch({ action });
          }}
        />
        <SelectFilter
          label="Rule"
          value={filters.rule}
          options={ENGINE_RULES.map((value) => ({ value, label: humanizeEnum(value) }))}
          onChange={(rule) => {
            patch({ rule });
          }}
        />
        <SelectFilter
          label="Minimum score"
          value={filters.minScore === null ? null : String(filters.minScore)}
          options={[
            { value: "40", label: "40+ (elevated)" },
            { value: "60", label: "60+ (high)" },
            { value: "85", label: "85+ (critical)" },
          ]}
          onChange={(v) => {
            patch({ minScore: v === null ? null : Number(v) });
          }}
        />
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>

      <DataTable
        label="Risk assessments"
        subject="assessments"
        columns={columns}
        rows={rows}
        getRowId={(a) => a.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={open?.id}
        empty={{
          icon: ActivityIcon,
          title: "No assessments",
          description:
            "Every scored event appears here, including the ones that passed. An empty list with live traffic means the engine is not evaluating.",
        }}
      />

      {pageInfo && pageInfo.total > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Page {pageInfo.page} of {Math.max(1, pageInfo.pages)} · {pageInfo.total} assessments
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || result.isFetching}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
              }}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageInfo.pages || result.isFetching}
              onClick={() => {
                setPage((p) => p + 1);
              }}
            >
              Next
            </Button>
          </span>
        </div>
      )}

      <ExplanationSheet
        assessment={open}
        canViewUsers={canViewUsers}
        onClose={() => {
          setOpen(null);
        }}
      />
    </div>
  );
}

/**
 * Why this event scored what it did.
 *
 * Deliberately evidence-first: the contributing rules come before the total,
 * because the total is a consequence and the rules are the reviewable part.
 */
function ExplanationSheet({
  assessment,
  canViewUsers,
  onClose,
}: {
  assessment: RiskAssessment | null;
  canViewUsers: boolean;
  onClose: () => void;
}) {
  // The baseline gives the score context. Loaded only while the drawer is
  // open — it is a second round trip and most rows are never opened.
  const userId = assessment?.userId ?? null;
  const profile = useQuery({
    queryKey: ["risk", "user", userId],
    queryFn: ({ signal }) => fetchUserRisk(userId ?? "", signal),
    enabled: userId !== null,
  });

  if (!assessment) return <Sheet open={false} onOpenChange={onClose} />;

  const band = scoreBand(assessment.riskScore);
  const intervened = INTERVENING_ACTIONS.includes(assessment.action as RiskActionName);
  const baseline = profile.data?.baseline;
  const amount = assessment.amountNaira === null ? null : Number(assessment.amountNaira);
  const multiple =
    amount !== null && baseline && baseline.medianAmount > 0
      ? amount / baseline.medianAmount
      : null;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">Score {assessment.riskScore}</span>
              <Badge tone={band.tone}>{band.label}</Badge>
              <Badge tone={ACTION_TONE[assessment.action] ?? "neutral"}>
                {humanizeEnum(assessment.action)}
              </Badge>
            </span>
          </SheetTitle>
          <SheetDescription>
            {intervened
              ? "The engine intervened on this event."
              : "Recorded for monitoring; the event was not stopped."}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Why this was flagged</h3>
            {assessment.signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rule fired. The event was assessed and scored {assessment.riskScore}.
              </p>
            ) : (
              <ul className="grid gap-2">
                {assessment.signals.map((s, i) => (
                  <li
                    key={`${s.rule}-${i}`}
                    className="grid gap-1 rounded-md border border-border p-3"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{humanizeEnum(s.rule)}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        +{s.points}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{s.detail}</span>
                    {s.evidence && Object.keys(s.evidence).length > 0 && (
                      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {Object.entries(s.evidence).map(([k, v]) => (
                          <span key={k} className="contents">
                            <dt className="truncate">{humanizeEnum(k)}</dt>
                            <dd className="truncate font-mono">{formatEvidence(v)}</dd>
                          </span>
                        ))}
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Points sum to the score. The decision comes from the score together with the amount at
              stake — a high score on a small sum is recorded, not stopped.
            </p>
          </section>

          <section className="grid gap-2 pt-4">
            <h3 className="text-sm font-medium">Against this customer&rsquo;s normal</h3>
            {profile.isPending ? (
              <p className="text-sm text-muted-foreground">Loading baseline&hellip;</p>
            ) : profile.isError || !baseline ? (
              <p className="text-sm text-muted-foreground">Baseline unavailable.</p>
            ) : !baseline.established ? (
              <p className="text-sm text-muted-foreground">
                No established baseline — only {baseline.sampleSize} prior transactions. Rules that
                compare against normal behaviour cannot fire reliably yet.
              </p>
            ) : (
              <DetailList
                items={[
                  {
                    label: "This amount",
                    value: amount === null ? "—" : formatAmount(amount, "NGN"),
                  },
                  {
                    label: "Their median",
                    value: formatAmount(baseline.medianAmount, "NGN"),
                  },
                  {
                    label: "Multiple of median",
                    value: multiple === null ? "—" : `${multiple.toFixed(1)}x`,
                    hideWhenEmpty: multiple === null,
                  },
                  {
                    label: "Their 95th percentile",
                    value: formatAmount(baseline.p95Amount, "NGN"),
                  },
                  {
                    label: "Largest ever",
                    value: formatAmount(baseline.maxAmount, "NGN"),
                  },
                  {
                    label: "Baseline sample",
                    value: `${baseline.sampleSize} transactions`,
                  },
                  {
                    label: "Baseline computed",
                    value: <DateTime value={baseline.lastComputedAt} />,
                  },
                ]}
              />
            )}
          </section>

          <section className="grid gap-2 pt-4">
            <h3 className="text-sm font-medium">Event</h3>
            <DetailList
              items={[
                {
                  label: "Customer",
                  value: canViewUsers ? (
                    <Link
                      href={`/users/${assessment.userId}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <UserSearchIcon className="size-3.5" aria-hidden />
                      {personName(assessment)}
                    </Link>
                  ) : (
                    personName(assessment)
                  ),
                },
                { label: "Event type", value: humanizeEnum(assessment.eventType) },
                {
                  label: "Transaction",
                  value: assessment.transactionReference ? (
                    <Link
                      href={`/transactions/${encodeURIComponent(assessment.transactionReference)}`}
                      className="hover:underline"
                    >
                      <Identifier value={assessment.transactionReference} copyable={false} />
                    </Link>
                  ) : null,
                  hideWhenEmpty: !assessment.transactionReference,
                },
                { label: "Assessed at", value: <DateTime value={assessment.createdAt} /> },
                {
                  label: "Open cases",
                  value: profile.data?.cases.length ?? 0,
                },
              ]}
            />
          </section>

          {profile.data && profile.data.cases.length > 0 && (
            <section className="grid gap-2 pt-4">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <ScaleIcon className="size-4" aria-hidden />
                Cases on this customer
              </h3>
              <ul className="grid gap-1 text-sm">
                {profile.data.cases.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs">{c.reference}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.trigger}</span>
                    <Badge tone="neutral">{humanizeEnum(c.status)}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
