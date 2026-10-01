"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConicalIcon, GaugeIcon, PencilIcon, ShieldOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DetailList } from "@/components/detail/detail-list";
import { SelectFilter } from "@/components/filters/select-filter";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Metric } from "@/features/overview/metric";
import { humanizeEnum } from "@/lib/format";

import { fetchAssessmentStats, INTERVENING_ACTIONS, type RiskActionName } from "./monitoring-api";
import {
  fetchRules,
  fetchRuleVersions,
  type RiskRule,
  RULE_STATUS_HELP,
  RULE_STATUS_TONE,
  RULE_STATUSES,
  type RuleSimulation,
  type RuleStatus,
  simulateRule,
  updateRule,
} from "./rules-api";

/**
 * The rules, their configuration and what they are actually doing.
 *
 * Configuration and firing volume belong on one screen because neither is
 * decidable without the other: "should this rule be paused?" is a question
 * about how often it fires and how much it contributes, and reading those off
 * two different pages is how a rule ends up switched off on a hunch.
 *
 * Two failure modes are worth naming. A rule firing on nearly every event is
 * miscalibrated, and its real effect is to train reviewers to skim. A rule
 * that has never fired is either dead code or looking for something that does
 * not happen here. Both look like "working" until someone counts.
 */

const WINDOWS = ["7", "30", "90"] as const;

interface RuleRow extends RiskRule {
  count: number;
  avgPoints: number;
  sharePercent: number;
}

export function RulesPanel() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>("30");
  const [open, setOpen] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ["risk", "rules"],
    queryFn: ({ signal }) => fetchRules(signal),
  });
  const statsQuery = useQuery({
    queryKey: ["risk", "assessment-stats", days],
    queryFn: ({ signal }) => fetchAssessmentStats(Number(days), signal),
  });

  const stats = statsQuery.data;
  const firing = new Map(stats?.byRule.map((r) => [r.rule, r]) ?? []);

  const rows: RuleRow[] = (rulesQuery.data ?? [])
    .map((rule) => {
      const hit = firing.get(rule.ruleKey);
      return {
        ...rule,
        count: hit?.count ?? 0,
        avgPoints: hit?.avgPoints ?? 0,
        sharePercent: hit && stats && stats.assessed > 0 ? (hit.count / stats.assessed) * 100 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  const current = rows.find((r) => r.ruleKey === open) ?? null;

  const interventions =
    stats?.byAction
      .filter((a) => INTERVENING_ACTIONS.includes(a.action as RiskActionName))
      .reduce((sum, a) => sum + a.count, 0) ?? undefined;
  const notScoring = rows.filter(
    (r) => r.status === "PAUSED" || r.status === "SHADOW" || r.status === "ARCHIVED",
  ).length;
  const silent = rows.filter((r) => r.count === 0).length;

  const columns: DataColumn<RuleRow>[] = [
    {
      id: "rule",
      header: "Rule",
      required: true,
      cell: (r) => (
        <span className="grid leading-tight">
          <span>{r.displayName || humanizeEnum(r.ruleKey)}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.ruleKey}</span>
        </span>
      ),
      exportValue: (r) => r.ruleKey,
    },
    {
      id: "status",
      header: "Status",
      description: "Active rules score. Shadow rules are recorded but contribute nothing.",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <Badge tone={RULE_STATUS_TONE[r.status] ?? "neutral"}>{humanizeEnum(r.status)}</Badge>
          {!r.configured && <span className="text-xs text-muted-foreground">default</span>}
        </span>
      ),
      exportValue: (r) => r.status,
    },
    {
      id: "count",
      header: "Times fired",
      align: "right",
      sortKey: "count",
      sortValue: (r) => r.count,
      cell: (r) =>
        r.count === 0 ? (
          <span className="text-muted-foreground">Never</span>
        ) : (
          <span className="tabular-nums">{r.count}</span>
        ),
      exportValue: (r) => r.count,
    },
    {
      id: "share",
      header: "Share of assessed",
      description:
        "Percentage of all events assessed in the window on which this rule fired. A rule near 100% is not discriminating.",
      align: "right",
      cell: (r) => (
        <span
          className={
            r.sharePercent >= 50 ? "font-medium text-warning tabular-nums" : "tabular-nums"
          }
        >
          {r.sharePercent.toFixed(1)}%
        </span>
      ),
      exportValue: (r) => r.sharePercent.toFixed(1),
    },
    {
      id: "points",
      header: "Points",
      description: "Average contribution when it fires. An override replaces the rule's own value.",
      align: "right",
      priority: "secondary",
      cell: (r) => (
        <span className="tabular-nums">
          {r.avgPoints.toFixed(1)}
          {r.pointsOverride !== null && r.pointsOverride !== undefined && (
            <span className="ml-1 text-xs text-muted-foreground">
              (override {r.pointsOverride})
            </span>
          )}
        </span>
      ),
      exportValue: (r) => r.avgPoints,
    },
    {
      id: "version",
      header: "Version",
      align: "right",
      priority: "tertiary",
      cell: (r) => (r.configured ? `v${r.version}` : "—"),
      exportValue: (r) => r.version,
    },
    {
      id: "updatedAt",
      header: "Last changed",
      priority: "tertiary",
      cell: (r) => (r.updatedAt ? <DateTime value={r.updatedAt} /> : "—"),
      exportValue: (r) => r.updatedAt,
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <section aria-label="Monitoring volume" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Events assessed"
          value={stats?.assessed}
          icon={GaugeIcon}
          isPending={statsQuery.isPending}
          isError={statsQuery.isError}
          definition={`Risk assessments written in the last ${days} days, including events that passed.`}
        />
        <Metric
          label="Interventions"
          value={interventions}
          icon={GaugeIcon}
          attention
          isPending={statsQuery.isPending}
          isError={statsQuery.isError}
          definition="Assessments whose decision was step-up, hold, restrict outbound or freeze."
        />
        <Metric
          label="Rules not scoring"
          value={notScoring}
          icon={ShieldOffIcon}
          attention
          isPending={rulesQuery.isPending}
          isError={rulesQuery.isError}
          definition="Rules paused, archived, or in shadow mode. These contribute nothing to any risk score."
        />
        <Metric
          label="Rules never fired"
          value={silent}
          icon={GaugeIcon}
          attention
          isPending={statsQuery.isPending}
          isError={statsQuery.isError}
          definition={`Rules that produced no signal in ${days} days. Either nothing matched, or the rule is not reaching data.`}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Window"
          value={days}
          options={WINDOWS.map((value) => ({ value, label: `Last ${value} days` }))}
          onChange={(next) => {
            if (next) setDays(next);
          }}
        />
        <div className="ml-auto">
          <Freshness
            updatedAt={rulesQuery.dataUpdatedAt}
            isFetching={rulesQuery.isFetching || statsQuery.isFetching}
            onRefresh={() => {
              void rulesQuery.refetch();
              void statsQuery.refetch();
            }}
          />
        </div>
      </div>

      <DataTable
        label="Risk rules"
        subject="rules"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.ruleKey}
        isLoading={rulesQuery.isFetching}
        error={rulesQuery.error}
        onRetry={() => void rulesQuery.refetch()}
        onRowActivate={(r) => {
          setOpen(r.ruleKey);
        }}
        activeRowId={open ?? undefined}
        empty={{
          icon: GaugeIcon,
          title: "No rules",
          description: "The engine reported no rules.",
        }}
      />
      <p className="text-xs text-muted-foreground">
        Firing volume only. Precision and false-positive rate need alert dispositions joined back to
        the rule that raised them, which the API does not expose yet.
      </p>

      {current && (
        <RuleSheet
          rule={current}
          onClose={() => {
            setOpen(null);
          }}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["risk"] });
            void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
          }}
        />
      )}
    </div>
  );
}

function RuleSheet({
  rule,
  onClose,
  onChanged,
}: {
  rule: RuleRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nextStatus, setNextStatus] = useState<RuleStatus>(rule.status as RuleStatus);
  const [nextPoints, setNextPoints] = useState<string>(
    rule.pointsOverride === null || rule.pointsOverride === undefined
      ? ""
      : String(rule.pointsOverride),
  );
  const [simulation, setSimulation] = useState<RuleSimulation | null>(null);

  const versions = useQuery({
    queryKey: ["risk", "rule-versions", rule.ruleKey],
    queryFn: ({ signal }) => fetchRuleVersions(rule.ruleKey, signal),
  });

  const parsedPoints = nextPoints.trim() === "" ? null : Number(nextPoints);
  const pointsInvalid =
    parsedPoints !== null &&
    (!Number.isInteger(parsedPoints) || parsedPoints < 0 || parsedPoints > 100);

  const simulation$ = useMutation({
    mutationFn: () =>
      simulateRule(rule.ruleKey, {
        status: nextStatus,
        pointsOverride: parsedPoints,
        days: 30,
      }),
    onSuccess: setSimulation,
    onError: () => {
      toast.error("Simulation failed");
    },
  });

  const unchanged = nextStatus === rule.status && parsedPoints === (rule.pointsOverride ?? null);

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{rule.displayName || humanizeEnum(rule.ruleKey)}</SheetTitle>
          <SheetDescription>{rule.description}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <DetailList
            items={[
              {
                label: "Status",
                value: (
                  <span className="grid gap-0.5">
                    <Badge tone={RULE_STATUS_TONE[rule.status] ?? "neutral"}>
                      {humanizeEnum(rule.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {RULE_STATUS_HELP[rule.status] ?? "Unrecognised status."}
                    </span>
                  </span>
                ),
              },
              {
                label: "Configuration",
                value: rule.configured
                  ? `Version ${rule.version}`
                  : "None stored — running at the engine's coded defaults.",
              },
              {
                label: "Points override",
                value:
                  rule.pointsOverride === null || rule.pointsOverride === undefined
                    ? "None — the rule scores itself."
                    : String(rule.pointsOverride),
              },
              {
                label: "Fired (30d window)",
                value: `${rule.count} times · ${rule.sharePercent.toFixed(1)}% of assessed`,
              },
            ]}
          />

          <section className="grid gap-2 pt-4">
            <h3 className="text-sm font-medium">Propose a change</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="rule-status">Status</Label>
                <Select
                  value={nextStatus}
                  onValueChange={(v) => {
                    setNextStatus(v as RuleStatus);
                    setSimulation(null);
                  }}
                >
                  <SelectTrigger id="rule-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {humanizeEnum(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-points">Points override</Label>
                <Input
                  id="rule-points"
                  inputMode="numeric"
                  placeholder="Rule decides"
                  value={nextPoints}
                  onChange={(e) => {
                    setNextPoints(e.target.value);
                    setSimulation(null);
                  }}
                  aria-invalid={pointsInvalid}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{RULE_STATUS_HELP[nextStatus] ?? ""}</p>
            {pointsInvalid && (
              <p className="text-xs text-destructive">
                Points must be a whole number between 0 and 100, or blank.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pointsInvalid || simulation$.isPending}
                onClick={() => {
                  simulation$.mutate();
                }}
              >
                <FlaskConicalIcon aria-hidden />
                {simulation$.isPending ? "Simulating…" : "Test against history"}
              </Button>
              <Button
                size="sm"
                disabled={pointsInvalid || unchanged}
                onClick={() => {
                  setEditing(true);
                }}
              >
                <PencilIcon aria-hidden />
                Apply change
              </Button>
            </div>

            {simulation && (
              <div className="grid gap-1 rounded-md border border-border p-3 text-sm">
                <span className="font-medium">Simulation over {simulation.windowDays} days</span>
                <span className="text-muted-foreground">
                  This rule fired on {simulation.assessmentsWhereRuleFired} assessments.{" "}
                  {simulation.assessmentsWithChangedScore} would have scored differently, by{" "}
                  {simulation.averageScoreDelta > 0 ? "+" : ""}
                  {simulation.averageScoreDelta} points on average.
                </span>
                {Object.keys(simulation.bandMovements).length > 0 && (
                  <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                    {Object.entries(simulation.bandMovements).map(([move, n]) => (
                      <li key={move}>
                        <span className="font-mono">{move.replace("->", " → ")}</span>: {n}
                      </li>
                    ))}
                  </ul>
                )}
                {simulation.truncated && (
                  <span className="text-xs text-warning">
                    Truncated at 5,000 assessments; the real effect is larger.
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{simulation.caveat}</span>
              </div>
            )}
          </section>

          <section className="grid gap-2 pt-4">
            <h3 className="text-sm font-medium">Change history</h3>
            {versions.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (versions.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Never changed. The rule runs as the engine defines it.
              </p>
            ) : (
              <ul className="grid gap-2">
                {versions.data?.map((v) => (
                  <li key={v.id} className="grid gap-0.5 rounded-md border border-border p-3">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        v{v.version} · {humanizeEnum(v.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <DateTime value={v.createdAt} />
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{v.changeReason}</span>
                    {v.changedByEmail && (
                      <span className="text-xs text-muted-foreground">{v.changedByEmail}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>

      <ConfirmActionDialog
        open={editing}
        onOpenChange={setEditing}
        title="Change risk rule"
        target={rule.displayName || rule.ruleKey}
        impact={
          <>
            {humanizeEnum(rule.status)} → <strong>{humanizeEnum(nextStatus)}</strong>
            {parsedPoints !== (rule.pointsOverride ?? null) && (
              <>
                {" "}
                · points override{" "}
                <strong>{parsedPoints === null ? "cleared" : parsedPoints}</strong>
              </>
            )}
            . {RULE_STATUS_HELP[nextStatus] ?? ""} The change is versioned and cannot be edited
            afterwards.
          </>
        }
        confirmLabel="Change rule"
        tone="danger"
        reason={{
          required: true,
          minLength: 10,
          label: "Reason for the change",
          hint: "Recorded permanently against this rule version.",
        }}
        stepUp={{ password: true, twoFactor: true }}
        onConfirm={async (values) => {
          await updateRule(rule.ruleKey, {
            status: nextStatus,
            pointsOverride: parsedPoints,
            changeReason: values.reason,
            password: values.password,
            twoFACode: values.twoFACode,
          });
          toast.success("Rule updated");
          onChanged();
          onClose();
        }}
      />
    </Sheet>
  );
}
