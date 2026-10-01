"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRingIcon, GaugeIcon, PercentIcon, TimerIcon, TriangleAlertIcon } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";

import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ruleLabel } from "@/features/compliance/labels";
import { Metric } from "@/features/overview/metric";
import { humanizeEnum } from "@/lib/format";

import { engineRuleDescription } from "./labels";
import {
  type AlertRulePerformance,
  type EngineSignalPerformance,
  fetchRulePerformance,
} from "./performance-api";

/**
 * Whether each rule is earning its place.
 *
 * The number that matters is the clearance rate, and it is deliberately NOT
 * called a false-positive rate. An alert can be correctly raised and correctly
 * cleared — that is monitoring working, not monitoring failing — and a team
 * that tunes on "false positives" defined as "anything cleared" will tune away
 * its own detection within a quarter.
 *
 * What the rate is genuinely good for is analyst load. A rule firing forty
 * times a week and cleared thirty-nine times is training people to clear the
 * fortieth without reading it, and that is the failure mode this page exists
 * to surface.
 *
 * Two tables, never merged: AML monitoring parameters have dispositions
 * because a person reviews each one; engine signals have interventions
 * because the engine acts on a combined score. Summing them would produce a
 * number with no meaning.
 */

const WINDOWS = [7, 30, 90] as const;

const RULE_STATUS_TONE: Record<string, "neutral" | "success" | "info" | "warning"> = {
  ACTIVE: "success",
  SHADOW: "info",
  PAUSED: "warning",
  DRAFT: "neutral",
  ARCHIVED: "neutral",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function PerformancePanel() {
  const [days, setDays] = useQueryState("perfDays", parseAsInteger.withDefault(30));

  const result = useQuery({
    queryKey: ["risk", "rule-performance", days],
    queryFn: ({ signal }) => fetchRulePerformance(days, signal),
  });
  const report = result.data;

  const alertColumns: DataColumn<AlertRulePerformance>[] = [
    {
      id: "rule",
      header: "Monitoring parameter",
      required: true,
      cell: (r) => (
        <span className="grid leading-tight">
          <span className="text-sm">{ruleLabel(r.rule)}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.rule}</span>
        </span>
      ),
      exportValue: (r) => r.rule,
    },
    {
      id: "status",
      header: "Config",
      description: "Configured state in the rule engine. Blank means it runs at coded defaults.",
      cell: (r) =>
        r.configuredStatus ? (
          <Badge tone={RULE_STATUS_TONE[r.configuredStatus] ?? "neutral"}>
            {humanizeEnum(r.configuredStatus)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Default</span>
        ),
      exportValue: (r) => r.configuredStatus ?? "default",
    },
    {
      id: "triggered",
      header: "Alerts",
      align: "right",
      cell: (r) => <span className="tabular-nums">{r.triggered}</span>,
      exportValue: (r) => r.triggered,
      sortKey: "triggered",
      sortValue: (r) => r.triggered,
    },
    {
      id: "open",
      header: "Open",
      align: "right",
      description: "Still awaiting a disposition.",
      cell: (r) => (
        <span className={r.open > 0 ? "text-warning tabular-nums" : "tabular-nums"}>
          {r.open + r.underReview}
        </span>
      ),
      exportValue: (r) => r.open + r.underReview,
    },
    {
      id: "clearanceRate",
      header: "Cleared",
      align: "right",
      description:
        "Share of dispositioned alerts cleared on review. Not a false-positive rate — an alert can be correctly raised and correctly cleared.",
      cell: (r) => (
        <span
          className={
            r.clearanceRate !== null && r.clearanceRate >= 0.9 && r.triggered >= 20
              ? "text-warning tabular-nums"
              : "tabular-nums"
          }
        >
          {percent(r.clearanceRate)}
        </span>
      ),
      exportValue: (r) => r.clearanceRate,
      sortKey: "clearanceRate",
      sortValue: (r) => r.clearanceRate ?? -1,
    },
    {
      id: "escalationRate",
      header: "Escalated",
      align: "right",
      description:
        "Share of dispositioned alerts escalated or reported. The nearest honest proxy for precision available — nothing records confirmed loss against an alert.",
      cell: (r) => <span className="tabular-nums">{percent(r.escalationRate)}</span>,
      exportValue: (r) => r.escalationRate,
    },
    {
      id: "avgHours",
      header: "Avg. to disposition",
      align: "right",
      priority: "secondary",
      cell: (r) =>
        r.averageHoursToDisposition === null ? (
          "—"
        ) : (
          <span className="tabular-nums">{r.averageHoursToDisposition.toFixed(1)} h</span>
        ),
      exportValue: (r) => r.averageHoursToDisposition,
    },
    {
      id: "oldestOpen",
      header: "Oldest open",
      align: "right",
      priority: "tertiary",
      description: "Age of the longest-waiting undispositioned alert for this parameter.",
      cell: (r) =>
        r.oldestOpenHours === null ? (
          "—"
        ) : (
          <span className="tabular-nums">{Math.round(r.oldestOpenHours)} h</span>
        ),
      exportValue: (r) => r.oldestOpenHours,
    },
  ];

  const engineColumns: DataColumn<EngineSignalPerformance>[] = [
    {
      id: "rule",
      header: "Engine signal",
      required: true,
      cell: (r) => {
        const description = engineRuleDescription(r.rule);
        return (
          <span className="grid leading-tight">
            {description ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-fit cursor-help text-sm underline decoration-dotted underline-offset-2">
                    {humanizeEnum(r.rule)}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{description}</TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-sm">{humanizeEnum(r.rule)}</span>
            )}
            <span className="font-mono text-xs text-muted-foreground">{r.rule}</span>
          </span>
        );
      },
      exportValue: (r) => r.rule,
    },
    {
      id: "status",
      header: "Config",
      cell: (r) =>
        r.configuredStatus ? (
          <Badge tone={RULE_STATUS_TONE[r.configuredStatus] ?? "neutral"}>
            {humanizeEnum(r.configuredStatus)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Default</span>
        ),
      exportValue: (r) => r.configuredStatus ?? "default",
    },
    {
      id: "fired",
      header: "Fired",
      align: "right",
      cell: (r) => <span className="tabular-nums">{r.fired}</span>,
      exportValue: (r) => r.fired,
      sortKey: "fired",
      sortValue: (r) => r.fired,
    },
    {
      id: "avgPoints",
      header: "Avg. points",
      align: "right",
      description: "Mean contribution to the risk score when this signal fires.",
      cell: (r) => <span className="tabular-nums">{r.averagePoints.toFixed(1)}</span>,
      exportValue: (r) => r.averagePoints,
    },
    {
      id: "interventions",
      header: "Interventions",
      align: "right",
      description:
        "Assessments where this signal fired and the engine stepped up, held, restricted or froze. The signal contributed; it was rarely the sole cause.",
      cell: (r) => <span className="tabular-nums">{r.interventions}</span>,
      exportValue: (r) => r.interventions,
    },
    {
      id: "shadowFires",
      header: "Scored zero",
      align: "right",
      priority: "secondary",
      description:
        "Fired while contributing no points — shadow mode, or a points override of zero. This is the measurement a rule should pass before it can hold anyone's money.",
      cell: (r) => <span className="tabular-nums">{r.shadowFires}</span>,
      exportValue: (r) => r.shadowFires,
    },
    {
      id: "lastFiredAt",
      header: "Last fired",
      priority: "tertiary",
      cell: (r) => <DateTime value={r.lastFiredAt} />,
      exportValue: (r) => r.lastFiredAt,
    },
  ];

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(days)} onValueChange={(next) => void setDays(Number(next))}>
          <SelectTrigger className="w-40" aria-label="Reporting window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((window) => (
              <SelectItem key={window} value={String(window)}>
                Last {window} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>

      <section
        aria-label="Rule performance summary"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Metric
          label="Alerts raised"
          value={report?.totals.alertsRaised}
          icon={BellRingIcon}
          isPending={result.isPending}
          isError={result.isError}
          definition={`Monitoring alerts created in the last ${days} days.`}
        />
        <Metric
          label="Awaiting disposition"
          value={report?.totals.alertsOpen}
          icon={TimerIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition="Alerts still open or under review. An alert never dispositioned is a control that did not operate."
        />
        <Metric
          label="Cleared on review"
          value={report?.totals.overallClearanceRate ?? undefined}
          display={percent(report?.totals.overallClearanceRate ?? null)}
          icon={PercentIcon}
          isPending={result.isPending}
          isError={result.isError}
          definition="Share of dispositioned alerts cleared. High is not automatically wrong — read it next to alert volume."
        />
        <Metric
          label="Median review time"
          value={report?.totals.medianHoursToDisposition ?? undefined}
          display={
            report?.totals.medianHoursToDisposition === null ||
            report?.totals.medianHoursToDisposition === undefined
              ? "—"
              : `${report.totals.medianHoursToDisposition.toFixed(1)} h`
          }
          icon={GaugeIcon}
          isPending={result.isPending}
          isError={result.isError}
          definition="Median hours between an alert being raised and dispositioned."
        />
      </section>

      {report && report.fatigue.length > 0 && (
        <section className="grid gap-2 rounded-md border border-warning/30 bg-warning/5 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlertIcon className="size-4 text-warning" aria-hidden />
            Rules producing more work than signal
          </h3>
          <ul className="grid gap-1.5">
            {report.fatigue.map((warning) => (
              <li key={warning.rule} className="text-sm">
                <span className="font-medium">{ruleLabel(warning.rule)}</span>
                <span className="text-muted-foreground"> — {warning.reason}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Turning a rule down has a detection cost. These are shown so the decision is made
            deliberately, not by the queue being ignored.
          </p>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">AML monitoring parameters</h3>
        <DataTable
          label="Monitoring parameter performance"
          subject="rules"
          columns={alertColumns}
          rows={report?.alertRules ?? []}
          getRowId={(r) => r.rule}
          isLoading={result.isFetching}
          error={result.error}
          onRetry={() => void result.refetch()}
          empty={{
            icon: BellRingIcon,
            title: "No alerts in this window",
            description: "No monitoring parameter raised an alert over the selected period.",
          }}
        />
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Risk engine signals</h3>
        <p className="text-xs text-muted-foreground">
          A different population from the parameters above: these are the engine&rsquo;s own scoring
          signals, and the two are never summed.
        </p>
        <DataTable
          label="Engine signal performance"
          subject="signals"
          columns={engineColumns}
          rows={report?.engineSignals ?? []}
          getRowId={(r) => r.rule}
          isLoading={result.isFetching}
          error={result.error}
          onRetry={() => void result.refetch()}
          empty={{
            icon: GaugeIcon,
            title: "No signals in this window",
            description: "The risk engine recorded no firing signals over the selected period.",
          }}
        />
      </section>
    </div>
  );
}
