"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BellRingIcon,
  FileWarningIcon,
  FilterXIcon,
  OctagonAlertIcon,
  ShieldAlertIcon,
  UserRoundSearchIcon,
} from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { SelectFilter } from "@/components/filters/select-filter";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/features/auth/admin-context";
import { Metric } from "@/features/overview/metric";
import { humanizeEnum } from "@/lib/format";

import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  type ComplianceAlert,
  type ComplianceReport,
  fetchAlert,
  fetchAlerts,
  fetchComplianceDashboard,
  fetchReports,
  MONITORING_RULES,
  REPORT_STATUSES,
  REPORT_TYPES,
} from "./api";
import {
  AssessReportDialog,
  DispositionDialog,
  FileReportDialog,
  ProfileDialog,
  RaiseReportDialog,
} from "./dialogs";
import { ALERT_STATUS, REPORT_STATUS, ruleLabel, SEVERITY_TONE, subjectName } from "./labels";

const TABS = ["alerts", "reports"] as const;

function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={SEVERITY_TONE[severity] ?? "neutral"}>{humanizeEnum(severity)}</Badge>;
}

function EvidenceView({ evidence }: { evidence: Record<string, unknown> | null | undefined }) {
  const entries = Object.entries(evidence ?? {});
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No evidence was recorded with this alert.</p>
    );
  }
  return (
    <DetailList
      items={entries.map(([key, value]) => ({
        label: humanizeEnum(key),
        value: (
          <pre className="font-mono text-xs whitespace-pre-wrap">
            {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
          </pre>
        ),
      }))}
    />
  );
}

/** AML/CFT work queues: monitoring alerts and the suspicious activity report register. */
export function ComplianceView() {
  const [state, setState] = useQueryStates(
    {
      tab: parseAsStringLiteral(TABS).withDefault("alerts"),
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(25),
      status: parseAsString,
      severity: parseAsStringLiteral(ALERT_SEVERITIES),
      rule: parseAsStringLiteral(MONITORING_RULES),
      type: parseAsStringLiteral(REPORT_TYPES),
      // Set by an in-app link — a notification, a search result — so arriving
      // from elsewhere opens the alert instead of a queue the admin then has to
      // find it in.
      alert: parseAsString,
    },
    { clearOnDefault: true },
  );
  const dashboard = useQuery({
    queryKey: ["compliance", "dashboard"],
    queryFn: ({ signal }) => fetchComplianceDashboard(signal),
  });
  const d = dashboard.data;

  return (
    <div className="grid gap-4">
      <section aria-label="Compliance summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Open alerts"
          value={d?.alerts.open}
          icon={BellRingIcon}
          attention
          isPending={dashboard.isPending}
          isError={dashboard.isError}
          definition={`Alerts open or under review.${d?.alerts.oldestOpenAgeDays != null ? ` The oldest open alert is ${d.alerts.oldestOpenAgeDays} days old.` : ""}`}
        />
        <Metric
          label="Critical alerts"
          value={d?.alerts.critical}
          icon={OctagonAlertIcon}
          attention
          isPending={dashboard.isPending}
          isError={dashboard.isError}
          definition="Critical-severity alerts still open or under review."
        />
        <Metric
          label="Reports in progress"
          value={d?.reports.open}
          icon={FileWarningIcon}
          attention
          isPending={dashboard.isPending}
          isError={dashboard.isError}
          definition={`Reports awaiting assessment or filing. ${d ? `${d.reports.filed} filed in total.` : ""}`}
        />
        <Metric
          label="High-risk customers"
          value={d?.customers.highRisk}
          icon={UserRoundSearchIcon}
          isPending={dashboard.isPending}
          isError={dashboard.isError}
          definition={
            d
              ? `Customers rated high risk. ${d.customers.pep} are PEPs or associates; ${d.customers.neverProfiled} of ${d.customers.total} customers have never been profiled.`
              : "Customers rated high risk."
          }
        />
      </section>

      <Tabs
        value={state.tab}
        onValueChange={(tab) =>
          void setState({
            tab: tab as (typeof TABS)[number],
            page: 1,
            status: null,
            severity: null,
            rule: null,
            type: null,
            alert: null,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="alerts">
            <BellRingIcon aria-hidden />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileWarningIcon aria-hidden />
            Report register
          </TabsTrigger>
        </TabsList>
        <TabsContent value="alerts">
          <AlertsPanel state={state} setState={setState} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsPanel state={state} setState={setState} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface PanelProps {
  state: {
    page: number;
    size: number;
    status: string | null;
    severity: (typeof ALERT_SEVERITIES)[number] | null;
    rule: (typeof MONITORING_RULES)[number] | null;
    type: (typeof REPORT_TYPES)[number] | null;
    alert: string | null;
  };
  setState: (patch: Record<string, unknown>) => unknown;
}

function AlertsPanel({ state, setState }: PanelProps) {
  const canViewUsers = useHasPermission("users.view");
  const [open, setOpen] = useState<ComplianceAlert | null>(null);
  // The URL wins while it names an alert, so a link opens the drawer on first
  // render — before the list has loaded and without needing the row to be on
  // the current page.
  const openId = state.alert ?? open?.id ?? null;
  const status = (ALERT_STATUSES as readonly string[]).includes(state.status ?? "")
    ? state.status
    : null;
  const query = {
    page: state.page,
    pageSize: state.size,
    status,
    severity: state.severity,
    rule: state.rule,
  };
  const result = useQuery({
    queryKey: ["compliance", "alerts", query],
    queryFn: ({ signal }) => fetchAlerts(query, signal),
    placeholderData: keepPreviousData,
  });
  const active = Boolean(status || state.severity || state.rule);

  const columns: DataColumn<ComplianceAlert>[] = [
    {
      id: "severity",
      header: "Severity",
      cell: (a) => <SeverityBadge severity={a.severity} />,
    },
    {
      id: "rule",
      header: "Rule",
      required: true,
      cell: (a) => (
        <span className="grid leading-tight">
          <span className="font-medium">{ruleLabel(a.rule)}</span>
          <span className="max-w-80 truncate text-xs text-muted-foreground">{a.summary}</span>
        </span>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      priority: "secondary",
      cell: (a) => (
        <span className="grid leading-tight">
          <span className="truncate">{subjectName(a.user)}</span>
          <span className="truncate text-xs text-muted-foreground">{a.user?.email}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (a) => <StatusBadge status={resolveStatus(ALERT_STATUS, a.status)} />,
    },
    {
      id: "createdAt",
      header: "Raised",
      priority: "secondary",
      cell: (a) => <DateTime value={a.createdAt} />,
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Status"
          value={status as (typeof ALERT_STATUSES)[number] | null}
          options={ALERT_STATUSES.map((value) => ({ value, label: ALERT_STATUS[value].label }))}
          onChange={(next) => void setState({ status: next, page: 1 })}
        />
        <SelectFilter
          label="Severity"
          value={state.severity}
          options={ALERT_SEVERITIES.map((value) => ({ value, label: humanizeEnum(value) }))}
          onChange={(severity) => void setState({ severity, page: 1 })}
        />
        <SelectFilter
          label="Rule"
          value={state.rule}
          options={MONITORING_RULES.map((value) => ({ value, label: ruleLabel(value) }))}
          onChange={(rule) => void setState({ rule, page: 1 })}
        />
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void setState({ status: null, severity: null, rule: null, page: 1 })}
          >
            <FilterXIcon aria-hidden />
            Clear filters
          </Button>
        )}
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>
      <DataTable
        label="Compliance alerts"
        subject="compliance alerts"
        columns={columns}
        rows={result.data?.rows ?? []}
        getRowId={(a) => a.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={openId}
        empty={{
          icon: ShieldAlertIcon,
          title: active ? "No alerts match" : "No alerts",
          description: active
            ? "Clear some filters to see more."
            : "Transaction monitoring raises alerts here when activity matches a rule.",
        }}
      />
      <Pagination
        page={state.page}
        pageSize={state.size}
        total={result.data?.total ?? 0}
        onPageChange={(page) => void setState({ page })}
        onPageSizeChange={(size) => void setState({ size: Math.min(size, 100), page: 1 })}
      />
      <AlertDrawer
        alertId={openId}
        onClose={() => {
          setOpen(null);
          if (state.alert) void setState({ alert: null });
        }}
        canViewUsers={canViewUsers}
      />
    </div>
  );
}

function AlertDrawer({
  alertId,
  onClose,
  canViewUsers,
}: {
  alertId: string | null;
  onClose: () => void;
  canViewUsers: boolean;
}) {
  const [dialog, setDialog] = useState<"disposition" | "report" | "profile" | null>(null);
  const detail = useQuery({
    queryKey: ["compliance", "alert", alertId],
    queryFn: ({ signal }) => fetchAlert(alertId ?? "", signal),
    enabled: alertId !== null,
  });
  const data = detail.data;
  const alert = data?.alert;
  const locked = alert?.status === "REPORTED";

  return (
    <Sheet
      open={alertId !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {alertId && (
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{alert ? ruleLabel(alert.rule) : "Alert"}</SheetTitle>
            <SheetDescription>{alert ? subjectName(alert.user) : "Loading…"}</SheetDescription>
          </SheetHeader>
          <SheetBody className="grid gap-5">
            {detail.isPending ? (
              <Skeleton className="h-64" />
            ) : detail.isError ? (
              <ErrorState
                error={detail.error}
                subject="this alert"
                onRetry={() => void detail.refetch()}
              />
            ) : (
              alert && (
                <>
                  <DetailList
                    items={[
                      { label: "Severity", value: <SeverityBadge severity={alert.severity} /> },
                      {
                        label: "Status",
                        value: <StatusBadge status={resolveStatus(ALERT_STATUS, alert.status)} />,
                      },
                      { label: "Summary", value: alert.summary },
                      { label: "Raised", value: <DateTime value={alert.createdAt} /> },
                      {
                        label: "Customer",
                        value: canViewUsers ? (
                          <Link href={`/users/${alert.userId}`} className="hover:underline">
                            {subjectName(alert.user)}
                          </Link>
                        ) : (
                          subjectName(alert.user)
                        ),
                      },
                      { label: "Review note", value: alert.reviewNote, hideWhenEmpty: true },
                      {
                        label: "Reviewed",
                        value: <DateTime value={alert.reviewedAt} />,
                        hideWhenEmpty: !alert.reviewedAt,
                      },
                    ]}
                  />
                  <DetailSection title="Evidence">
                    <EvidenceView evidence={alert.evidence} />
                  </DetailSection>
                  <DetailSection title="Compliance profile">
                    {data.complianceProfile ? (
                      <DetailList
                        items={[
                          {
                            label: "Risk rating",
                            value: (
                              <Badge
                                tone={SEVERITY_TONE[data.complianceProfile.riskRating] ?? "neutral"}
                              >
                                {humanizeEnum(data.complianceProfile.riskRating)}
                              </Badge>
                            ),
                          },
                          { label: "Rationale", value: data.complianceProfile.riskRationale },
                          {
                            label: "PEP status",
                            value: humanizeEnum(data.complianceProfile.pepStatus),
                          },
                          {
                            label: "Source of funds",
                            value: data.complianceProfile.sourceOfFunds
                              ? humanizeEnum(data.complianceProfile.sourceOfFunds)
                              : null,
                          },
                          { label: "Occupation", value: data.complianceProfile.occupation },
                          {
                            label: "Enhanced due diligence",
                            value: data.complianceProfile.eddRequired
                              ? data.complianceProfile.eddCompleted
                                ? "Required, completed"
                                : "Required, not completed"
                              : "Not required",
                          },
                          {
                            label: "Next review",
                            value: (
                              <DateTime value={data.complianceProfile.nextReviewAt} format="date" />
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This customer has not been profiled yet. Saving the profile creates one.
                      </p>
                    )}
                  </DetailSection>
                  {data.relatedAlerts.length > 1 && (
                    <DetailSection title="Other alerts for this customer">
                      <ul className="grid gap-1.5 text-sm">
                        {data.relatedAlerts
                          .filter((r) => r.id !== alert.id)
                          .map((related) => (
                            <li key={related.id} className="flex items-center gap-2">
                              <SeverityBadge severity={related.severity} />
                              <span className="flex-1 truncate">{ruleLabel(related.rule)}</span>
                              <StatusBadge status={resolveStatus(ALERT_STATUS, related.status)} />
                              <span className="text-xs text-muted-foreground">
                                <DateTime value={related.createdAt} format="date" />
                              </span>
                            </li>
                          ))}
                      </ul>
                    </DetailSection>
                  )}
                </>
              )
            )}
          </SheetBody>
          {alert && (
            <SheetFooter className="flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDialog("profile");
                }}
              >
                Edit profile
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() => {
                  setDialog("report");
                }}
              >
                Raise report
              </Button>
              <Button
                size="sm"
                disabled={locked}
                onClick={() => {
                  setDialog("disposition");
                }}
              >
                Record outcome
              </Button>
            </SheetFooter>
          )}
          {alert && (
            <>
              <DispositionDialog
                open={dialog === "disposition"}
                onOpenChange={(o) => {
                  setDialog(o ? "disposition" : null);
                }}
                alertId={alert.id}
              />
              <RaiseReportDialog
                open={dialog === "report"}
                onOpenChange={(o) => {
                  setDialog(o ? "report" : null);
                }}
                userId={alert.userId}
                customer={subjectName(alert.user)}
                alertIds={[alert.id]}
              />
              <ProfileDialog
                open={dialog === "profile"}
                onOpenChange={(o) => {
                  setDialog(o ? "profile" : null);
                }}
                userId={alert.userId}
                profile={
                  data.complianceProfile ?? {
                    id: "",
                    userId: alert.userId,
                    riskRating: "LOW",
                    riskRationale: null,
                    riskRatingSetAt: null,
                    nextReviewAt: null,
                    lastReviewedAt: null,
                    pepStatus: "UNKNOWN",
                    pepNote: null,
                    pepDeterminedAt: null,
                    sourceOfFunds: null,
                    sourceOfFundsDetail: null,
                    sourceOfWealth: null,
                    occupation: null,
                    expectedMonthlyVolume: null,
                    eddRequired: false,
                    eddCompleted: false,
                    updatedAt: null,
                  }
                }
              />
            </>
          )}
        </SheetContent>
      )}
    </Sheet>
  );
}

function ReportsPanel({ state, setState }: PanelProps) {
  const [open, setOpen] = useState<ComplianceReport | null>(null);
  const [dialog, setDialog] = useState<"assess" | "file" | null>(null);
  const status = (REPORT_STATUSES as readonly string[]).includes(state.status ?? "")
    ? state.status
    : null;
  const query = { page: state.page, pageSize: state.size, status, reportType: state.type };
  const result = useQuery({
    queryKey: ["compliance", "reports", query],
    queryFn: ({ signal }) => fetchReports(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = result.data?.rows ?? [];
  const current = open ? (rows.find((r) => r.id === open.id) ?? open) : null;

  const columns: DataColumn<ComplianceReport>[] = [
    {
      id: "reference",
      header: "Reference",
      required: true,
      cell: (r) => (
        <span className="grid leading-tight">
          <span className="font-mono text-xs">{r.reference}</span>
          <span className="text-xs text-muted-foreground">{r.reportType}</span>
        </span>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (r) => <span className="truncate">{subjectName(r.user)}</span>,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      priority: "secondary",
      cell: (r) => <Amount value={r.amountInvolved} currency="NGN" />,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={resolveStatus(REPORT_STATUS, r.status)} />,
    },
    {
      id: "createdAt",
      header: "Raised",
      priority: "secondary",
      cell: (r) => <DateTime value={r.createdAt} />,
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Status"
          value={status as (typeof REPORT_STATUSES)[number] | null}
          options={REPORT_STATUSES.map((value) => ({ value, label: REPORT_STATUS[value].label }))}
          onChange={(next) => void setState({ status: next, page: 1 })}
        />
        <SelectFilter
          label="Type"
          value={state.type}
          options={REPORT_TYPES.map((value) => ({ value, label: value }))}
          onChange={(type) => void setState({ type, page: 1 })}
        />
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Confidential. Never disclose to a customer that a report exists or is being considered.
      </p>
      <DataTable
        label="Report register"
        subject="the report register"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={open?.id}
        empty={{
          icon: FileWarningIcon,
          title: "No reports",
          description: "Reports raised from alerts or customer reviews appear here.",
        }}
      />
      <Pagination
        page={state.page}
        pageSize={state.size}
        total={result.data?.total ?? 0}
        onPageChange={(page) => void setState({ page })}
        onPageSizeChange={(size) => void setState({ size: Math.min(size, 100), page: 1 })}
      />

      <Sheet
        open={current !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        {current && (
          <SheetContent className="sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>{current.reference}</SheetTitle>
              <SheetDescription>{subjectName(current.user)}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <DetailList
                items={[
                  {
                    label: "Status",
                    value: <StatusBadge status={resolveStatus(REPORT_STATUS, current.status)} />,
                  },
                  { label: "Type", value: current.reportType },
                  { label: "Grounds", value: current.suspicionGrounds },
                  {
                    label: "Amount involved",
                    value: <Amount value={current.amountInvolved} currency="NGN" />,
                    hideWhenEmpty: !current.amountInvolved,
                  },
                  { label: "Raised", value: <DateTime value={current.createdAt} /> },
                  {
                    label: "Assessed",
                    value: <DateTime value={current.assessedAt} />,
                    hideWhenEmpty: !current.assessedAt,
                  },
                  { label: "Rationale", value: current.assessmentRationale, hideWhenEmpty: true },
                  {
                    label: "Filed",
                    value: <DateTime value={current.filedAt} />,
                    hideWhenEmpty: !current.filedAt,
                  },
                  { label: "NFIU reference", value: current.nfiuReference, hideWhenEmpty: true },
                  { label: "Filing note", value: current.filingNote, hideWhenEmpty: true },
                ]}
              />
            </SheetBody>
            <SheetFooter>
              {current.status !== "FILED" && current.status !== "PENDING_FILING" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setDialog("assess");
                  }}
                >
                  Assess
                </Button>
              )}
              {current.status === "PENDING_FILING" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setDialog("file");
                  }}
                >
                  Record filing
                </Button>
              )}
            </SheetFooter>
            <AssessReportDialog
              open={dialog === "assess"}
              onOpenChange={(o) => {
                setDialog(o ? "assess" : null);
              }}
              reportId={current.id}
            />
            <FileReportDialog
              open={dialog === "file"}
              onOpenChange={(o) => {
                setDialog(o ? "file" : null);
              }}
              reportId={current.id}
            />
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
