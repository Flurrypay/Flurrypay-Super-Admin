"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIcon,
  BriefcaseIcon,
  CircleCheckIcon,
  ClockAlertIcon,
  GaugeIcon,
  HandIcon,
  HeartPulseIcon,
  KeyRoundIcon,
  LockIcon,
  NetworkIcon,
  PercentIcon,
  PlusIcon,
  SearchIcon,
  ShieldHalfIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DetailList } from "@/components/detail/detail-list";
import { SelectFilter } from "@/components/filters/select-filter";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useHasPermission } from "@/features/auth/admin-context";
import { SEVERITY_TONE } from "@/features/compliance/labels";
import { Metric } from "@/features/overview/metric";
import { formatAmount, humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  CASE_OUTCOMES,
  CASE_SEVERITIES,
  CASE_STATUSES,
  type CaseOutcome,
  EVIDENCE_TYPES,
  fetchActiveHolds,
  fetchRiskCases,
  fetchRiskOverview,
  type FundHold,
  placeHold,
  releaseHold,
  requestCaseEvidence,
  resolveRiskCase,
  type RiskCase,
} from "./api";
import { AssessmentsPanel } from "./assessments-panel";
import { EngineHealthPanel } from "./engine-health-panel";
import { FraudSearch } from "./fraud-search";
import { fetchQueueCounts } from "./investigation-api";
import { InvestigationSheet } from "./investigation-sheet";
import { CounterpartyLookup, NetworkPanel } from "./network-panel";
import { PerformancePanel } from "./performance-panel";
import { RulesPanel } from "./rules-panel";
import { TakeoverPanel } from "./takeover-panel";
import { WatchlistPanel } from "./watchlist-panel";

const TABS = [
  "cases",
  "holds",
  "monitoring",
  "network",
  "watchlist",
  "takeover",
  "rules",
  "performance",
  "search",
  "health",
] as const;

/**
 * The working queues.
 *
 * An investigator does not work "all cases" — they work their own, the
 * unassigned pile, or whatever is overdue. These are server-side filters, not
 * a client-side narrowing of the first hundred rows: filtering in the browser
 * silently hides the overdue case ranked 140th, which is exactly the one that
 * matters.
 */
const QUEUES = [
  { id: "all", label: "All open", filter: {} as QueueFilter },
  { id: "mine", label: "My cases", filter: { assignedToAdminId: "me" } as QueueFilter },
  {
    id: "unassigned",
    label: "Unassigned",
    filter: { assignedToAdminId: "unassigned" } as QueueFilter,
  },
  { id: "critical", label: "Critical", filter: { severity: "CRITICAL" } as QueueFilter },
  { id: "overdue", label: "Overdue", filter: { overdue: true } as QueueFilter },
  { id: "escalated", label: "Escalated", filter: { escalated: true } as QueueFilter },
] as const;

type QueueId = (typeof QUEUES)[number]["id"];

interface QueueFilter {
  assignedToAdminId?: string;
  severity?: string;
  overdue?: boolean;
  escalated?: boolean;
}
const OPEN_STATUSES = ["OPEN", "AWAITING_CUSTOMER", "UNDER_REVIEW"];

const CASE_STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  OPEN: "warning",
  AWAITING_CUSTOMER: "info",
  UNDER_REVIEW: "info",
  CLEARED: "success",
  CONFIRMED: "danger",
  CLOSED: "neutral",
};

function useRefreshRisk() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["risk"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      queryClient.invalidateQueries({ queryKey: ["user"] }),
    ]);
}

/** Fraud and AML interventions: review cases and money held on customer balances. */
export function RiskView() {
  const [state, setState] = useQueryStates(
    {
      tab: parseAsStringLiteral(TABS).withDefault("cases"),
      status: parseAsStringLiteral(CASE_STATUSES),
      severity: parseAsStringLiteral(CASE_SEVERITIES),
      queue: parseAsStringLiteral(QUEUES.map((q) => q.id)).withDefault("all"),
      // Set by a search result or an in-app link, so opening an investigation
      // from anywhere lands on the case rather than on the list.
      case: parseAsString,
    },
    { clearOnDefault: true },
  );
  const overview = useQuery({
    queryKey: ["risk", "overview"],
    queryFn: ({ signal }) => fetchRiskOverview(signal),
  });
  const o = overview.data;

  return (
    <div className="grid gap-4">
      <section aria-label="Risk summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Open cases"
          value={o ? o.cases.open : undefined}
          icon={BriefcaseIcon}
          attention
          isPending={overview.isPending}
          isError={overview.isError}
          definition={`Cases in OPEN status. ${o ? `${o.cases.awaitingCustomer} more are waiting for the customer.` : ""}`}
        />
        <Metric
          label="Overdue cases"
          value={o?.cases.overdue}
          icon={ClockAlertIcon}
          attention
          isPending={overview.isPending}
          isError={overview.isError}
          definition="Open, awaiting-customer or under-review cases past their due date."
        />
        <Metric
          label="Money on hold"
          value={o ? Number(o.holds.totalHeldNaira ?? 0) : undefined}
          display={
            <Amount value={o?.holds.totalHeldNaira} currency="NGN" className="font-semibold" />
          }
          icon={LockIcon}
          isPending={overview.isPending}
          isError={overview.isError}
          definition={`Naira held across ${o?.holds.active ?? 0} active holds.`}
        />
        <Metric
          label="Interventions · 7 days"
          value={o?.interventionsLast7Days}
          icon={ShieldHalfIcon}
          isPending={overview.isPending}
          isError={overview.isError}
          definition="Automated risk decisions in the last 7 days that held a transaction, restricted outbound funds or froze an account."
        />
      </section>

      <Tabs
        value={state.tab}
        onValueChange={(tab) => void setState({ tab: tab as (typeof TABS)[number] })}
      >
        <TabsList>
          <TabsTrigger value="cases">
            <BriefcaseIcon aria-hidden />
            Cases
          </TabsTrigger>
          <TabsTrigger value="holds">
            <LockIcon aria-hidden />
            Holds
          </TabsTrigger>
          <TabsTrigger value="monitoring">
            <ActivityIcon aria-hidden />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="network">
            <NetworkIcon aria-hidden />
            Network
          </TabsTrigger>
          <TabsTrigger value="watchlist">
            <UsersIcon aria-hidden />
            Watchlist
          </TabsTrigger>
          <TabsTrigger value="takeover">
            <KeyRoundIcon aria-hidden />
            Takeover
          </TabsTrigger>
          <TabsTrigger value="rules">
            <GaugeIcon aria-hidden />
            Rules
          </TabsTrigger>
          <TabsTrigger value="performance">
            <PercentIcon aria-hidden />
            Performance
          </TabsTrigger>
          <TabsTrigger value="search">
            <SearchIcon aria-hidden />
            Search
          </TabsTrigger>
          <TabsTrigger value="health">
            <HeartPulseIcon aria-hidden />
            Engine health
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cases">
          <CasesPanel
            status={state.status}
            severity={state.severity}
            queue={state.queue}
            openCaseId={state.case}
            onFilter={(patch) => void setState(patch)}
          />
        </TabsContent>
        <TabsContent value="holds">
          <HoldsPanel />
        </TabsContent>
        <TabsContent value="monitoring">
          <AssessmentsPanel />
        </TabsContent>
        <TabsContent value="network">
          <NetworkLookupPanel />
        </TabsContent>
        <TabsContent value="watchlist">
          <WatchlistPanel />
        </TabsContent>
        <TabsContent value="takeover">
          <TakeoverPanel />
        </TabsContent>
        <TabsContent value="rules">
          <RulesPanel />
        </TabsContent>
        <TabsContent value="performance">
          <PerformancePanel />
        </TabsContent>
        <TabsContent value="search">
          <FraudSearch />
        </TabsContent>
        <TabsContent value="health">
          <EngineHealthPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CasesPanel({
  status,
  severity,
  queue,
  openCaseId,
  onFilter,
}: {
  status: (typeof CASE_STATUSES)[number] | null;
  severity: (typeof CASE_SEVERITIES)[number] | null;
  queue: QueueId;
  openCaseId: string | null;
  onFilter: (patch: {
    status?: typeof status;
    severity?: typeof severity;
    queue?: QueueId;
    case?: string | null;
  }) => void;
}) {
  const canViewUsers = useHasPermission("users.view");
  const [open, setOpen] = useState<RiskCase | null>(null);
  const [dialog, setDialog] = useState<"resolve" | "evidence" | null>(null);

  const queueFilter = QUEUES.find((q) => q.id === queue)?.filter ?? {};
  const result = useQuery({
    queryKey: ["risk", "cases", { status, severity, queue }],
    queryFn: ({ signal }) =>
      fetchRiskCases(
        {
          ...queueFilter,
          status,
          // An explicit severity filter wins over the queue's own, so choosing
          // one inside the critical queue is not silently ignored.
          severity: severity ?? queueFilter.severity ?? null,
        },
        signal,
      ),
  });
  const counts = useQuery({
    queryKey: ["risk", "queues"],
    queryFn: ({ signal }) => fetchQueueCounts(signal),
  });
  const rows = result.data ?? [];
  const current = open ? (rows.find((c) => c.id === open.id) ?? open) : null;
  const isOpen = current ? OPEN_STATUSES.includes(current.status) : false;

  const columns: DataColumn<RiskCase>[] = [
    {
      id: "reference",
      header: "Case",
      required: true,
      cell: (c) => (
        <span className="grid leading-tight">
          <span className="font-mono text-xs">{c.reference}</span>
          <span className="max-w-72 truncate text-xs text-muted-foreground">{c.trigger}</span>
        </span>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      cell: (c) => (
        <Badge tone={SEVERITY_TONE[c.severity] ?? "neutral"}>{humanizeEnum(c.severity)}</Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (c) => (
        <Badge tone={CASE_STATUS_TONE[c.status] ?? "neutral"}>{humanizeEnum(c.status)}</Badge>
      ),
    },
    {
      id: "held",
      header: "Held",
      align: "right",
      priority: "secondary",
      cell: (c) =>
        c.heldAmountNaira && Number(c.heldAmountNaira) > 0 ? (
          <Amount value={c.heldAmountNaira} currency="NGN" />
        ) : (
          "—"
        ),
    },
    {
      id: "dueAt",
      header: "Due",
      priority: "secondary",
      cell: (c) => {
        const overdue =
          OPEN_STATUSES.includes(c.status) && c.dueAt !== null && new Date(c.dueAt) < new Date();
        return (
          <span className={overdue ? "font-medium text-warning" : undefined}>
            <DateTime value={c.dueAt} format="date" />
            {overdue && <span className="sr-only"> (overdue)</span>}
          </span>
        );
      },
    },
    {
      id: "owner",
      header: "Owner",
      priority: "secondary",
      description: "Who is working this case. Unassigned cases are nobody's job yet.",
      cell: (c) =>
        c.assignedToAdminId ? (
          <span className="text-xs">Assigned</span>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        ),
    },
    {
      id: "queue",
      header: "Queue",
      priority: "tertiary",
      cell: (c) => (c.queue ? humanizeEnum(c.queue) : "—"),
    },
    {
      id: "createdAt",
      header: "Opened",
      priority: "tertiary",
      cell: (c) => <DateTime value={c.createdAt} />,
    },
  ];

  const queueCount: Record<QueueId, number | undefined> = {
    all: undefined,
    mine: counts.data?.mine,
    unassigned: counts.data?.unassigned,
    critical: counts.data?.critical,
    overdue: counts.data?.overdue,
    escalated: counts.data?.escalated,
  };

  return (
    <div className="grid gap-3 pt-2">
      <div
        role="group"
        aria-label="Case queues"
        className="flex flex-wrap items-center gap-1 rounded-md border bg-card p-1"
      >
        {QUEUES.map((q) => {
          const active = q.id === queue;
          const count = queueCount[q.id];
          return (
            <button
              key={q.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onFilter({ queue: q.id });
              }}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {q.label}
              {count !== undefined && count > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Status"
          value={status}
          options={CASE_STATUSES.map((value) => ({ value, label: humanizeEnum(value) }))}
          onChange={(next) => {
            onFilter({ status: next });
          }}
        />
        <SelectFilter
          label="Severity"
          value={severity}
          options={CASE_SEVERITIES.map((value) => ({ value, label: humanizeEnum(value) }))}
          onChange={(next) => {
            onFilter({ severity: next });
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
        label="Risk cases"
        subject="risk cases"
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={open?.id}
        empty={{
          icon: CircleCheckIcon,
          title: "No cases",
          description: "Cases opened by risk monitoring or by freezing a transaction appear here.",
        }}
      />
      {rows.length === 100 && (
        <p className="text-xs text-muted-foreground">
          The API returns at most 100 cases. Filter by status or severity to see the rest.
        </p>
      )}

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
              <SheetDescription>{current.trigger}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <DetailList
                items={[
                  {
                    label: "Status",
                    value: (
                      <Badge tone={CASE_STATUS_TONE[current.status] ?? "neutral"}>
                        {humanizeEnum(current.status)}
                      </Badge>
                    ),
                  },
                  {
                    label: "Severity",
                    value: (
                      <Badge tone={SEVERITY_TONE[current.severity] ?? "neutral"}>
                        {humanizeEnum(current.severity)}
                      </Badge>
                    ),
                  },
                  {
                    label: "Customer",
                    value: canViewUsers ? (
                      <Link
                        href={`/users/${current.userId}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {current.userId}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{current.userId}</span>
                    ),
                  },
                  { label: "Description", value: current.description },
                  {
                    label: "Risk score",
                    value: current.riskScore ?? null,
                    hideWhenEmpty: current.riskScore == null,
                  },
                  {
                    label: "Held",
                    value: <Amount value={current.heldAmountNaira} currency="NGN" />,
                    hideWhenEmpty:
                      !current.heldAmountNaira || Number(current.heldAmountNaira) === 0,
                  },
                  {
                    label: "Held transaction",
                    value: current.heldTransactionReference ? (
                      <Link
                        href={`/transactions/${encodeURIComponent(current.heldTransactionReference)}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {current.heldTransactionReference}
                      </Link>
                    ) : null,
                    hideWhenEmpty: !current.heldTransactionReference,
                  },
                  { label: "Due", value: <DateTime value={current.dueAt} /> },
                  {
                    label: "Evidence requested",
                    value: current.evidenceRequested?.map(humanizeEnum).join(", ") ?? null,
                    hideWhenEmpty: !current.evidenceRequested?.length,
                  },
                  {
                    label: "Evidence received",
                    value: current.evidenceSubmitted?.length ? (
                      <ul className="grid gap-1">
                        {current.evidenceSubmitted.map((e, i) => (
                          <li key={`${e.type}-${i}`}>
                            {humanizeEnum(e.type)}
                            {e.note && (
                              <span className="text-muted-foreground">: {e.note}</span>
                            )}{" "}
                            <span className="text-xs text-muted-foreground">
                              (<DateTime value={e.submittedAt} format="date" />)
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null,
                    hideWhenEmpty: !current.evidenceSubmitted?.length,
                  },
                  { label: "Resolution", value: current.resolution, hideWhenEmpty: true },
                  {
                    label: "Resolved",
                    value: <DateTime value={current.resolvedAt} />,
                    hideWhenEmpty: !current.resolvedAt,
                  },
                ]}
              />
            </SheetBody>
            <SheetFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onFilter({ case: current.id });
                  setOpen(null);
                }}
              >
                <ShieldHalfIcon aria-hidden />
                Open investigation
              </Button>
              {isOpen && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDialog("evidence");
                    }}
                  >
                    Request evidence
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDialog("resolve");
                    }}
                  >
                    Resolve case
                  </Button>
                </>
              )}
            </SheetFooter>
            <ResolveCaseDialog
              open={dialog === "resolve"}
              onOpenChange={(o) => {
                setDialog(o ? "resolve" : null);
              }}
              riskCase={current}
            />
            <EvidenceDialog
              open={dialog === "evidence"}
              onOpenChange={(o) => {
                setDialog(o ? "evidence" : null);
              }}
              riskCase={current}
            />
          </SheetContent>
        )}
      </Sheet>

      {/*
        The quick-look sheet above answers "what is this case". The workspace
        answers "why, what is connected, and what has been done" — kept
        separate so scanning a queue does not load a dossier for every row.
      */}
      <InvestigationSheet
        caseId={openCaseId}
        onOpenChange={(next) => {
          if (!next) onFilter({ case: null });
        }}
      />
    </div>
  );
}

/**
 * Relationship lookup, outside the context of a case.
 *
 * The same panel the investigation workspace embeds, reachable on its own for
 * the enquiry that starts with a customer id rather than an alert.
 */
function NetworkLookupPanel() {
  const [userId, setUserId] = useState("");
  const [submitted, setSubmitted] = useState("");

  return (
    <div className="grid gap-3 pt-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(userId.trim());
        }}
      >
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="network-user">Customer id</Label>
          <Input
            id="network-user"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
            }}
            placeholder="Paste a customer id to see connected accounts"
          />
        </div>
        <Button type="submit" size="sm" disabled={!userId.trim()}>
          <NetworkIcon aria-hidden />
          Find connections
        </Button>
      </form>

      {submitted ? (
        <NetworkPanel userId={submitted} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Shows accounts sharing a device, a payee account, a crypto destination, a mailbox or a
          recent IP address. Every one of those has ordinary explanations — the panel says which.
        </p>
      )}

      <CounterpartyLookup />
    </div>
  );
}

const OUTCOME_COPY: Record<CaseOutcome, string> = {
  CLEARED: "Cleared: releases this case's holds and lifts restrictions it placed",
  CONFIRMED: "Confirmed: the suspicion is upheld; holds stay in place",
  CLOSED: "Closed: no conclusion (e.g. customer never responded); holds stay in place",
};

function ResolveCaseDialog({
  riskCase,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCase: RiskCase;
}) {
  const refresh = useRefreshRisk();
  const [outcome, setOutcome] = useState<CaseOutcome | "">("");
  const [resolution, setResolution] = useState("");
  return (
    <FormDialog
      {...props}
      title={`Resolve ${riskCase.reference}`}
      description="The resolution is the permanent record of this decision."
      submitLabel="Resolve case"
      tone={outcome === "CONFIRMED" ? "danger" : "default"}
      validate={() =>
        !outcome
          ? "Choose an outcome."
          : resolution.trim().length < 15
            ? "The resolution must be at least 15 characters."
            : null
      }
      onSubmit={async () => {
        const result = await resolveRiskCase(riskCase.id, {
          outcome: outcome as CaseOutcome,
          resolution: resolution.trim(),
        });
        toast.success(result.message || "Case resolved");
        await refresh();
      }}
    >
      <Field id="case-outcome" label="Outcome">
        <Select
          value={outcome}
          onValueChange={(v) => {
            setOutcome(v as CaseOutcome);
          }}
        >
          <SelectTrigger id="case-outcome">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {CASE_OUTCOMES.map((value) => (
              <SelectItem key={value} value={value}>
                {OUTCOME_COPY[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="case-resolution" label="Resolution" hint="At least 15 characters.">
        <Textarea
          id="case-resolution"
          value={resolution}
          maxLength={5000}
          onChange={(e) => {
            setResolution(e.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

function EvidenceDialog({
  riskCase,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskCase: RiskCase;
}) {
  const refresh = useRefreshRisk();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [other, setOther] = useState("");
  const items = [...chosen, ...(other.trim() ? [other.trim()] : [])];
  return (
    <FormDialog
      {...props}
      title="Request evidence"
      description="The customer is notified in the app and the case waits for their response."
      submitLabel="Send request"
      validate={() => (items.length ? null : "Choose at least one item.")}
      onSubmit={async () => {
        await requestCaseEvidence(riskCase.id, items);
        toast.success("Evidence requested");
        await refresh();
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">What the customer should provide</legend>
        {EVIDENCE_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <Checkbox
              id={`evidence-${type}`}
              checked={chosen.has(type)}
              onCheckedChange={(checked) => {
                setChosen((current) => {
                  const next = new Set(current);
                  if (checked === true) next.add(type);
                  else next.delete(type);
                  return next;
                });
              }}
            />
            <Label htmlFor={`evidence-${type}`} className="font-normal">
              {humanizeEnum(type)}
            </Label>
          </div>
        ))}
      </fieldset>
      <Field id="evidence-other" label="Something else (optional)">
        <Input
          id="evidence-other"
          value={other}
          maxLength={80}
          onChange={(e) => {
            setOther(e.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

function HoldsPanel() {
  const refresh = useRefreshRisk();
  const canViewUsers = useHasPermission("users.view");
  const [placing, setPlacing] = useState(false);
  const [releasing, setReleasing] = useState<FundHold | null>(null);
  const result = useQuery({
    queryKey: ["risk", "holds"],
    queryFn: ({ signal }) => fetchActiveHolds(signal),
  });
  const release = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => releaseHold(id, reason),
    onSuccess: async (data) => {
      toast.success(data.message || "Hold released");
      await refresh();
    },
  });

  const columns: DataColumn<FundHold>[] = [
    {
      id: "amount",
      header: "Amount",
      required: true,
      cell: (h) =>
        h.assetType === "CRYPTO" ? (
          <Amount value={h.amountCrypto} currency={h.currency} />
        ) : (
          <Amount value={h.amountNaira} currency="NGN" />
        ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (h) =>
        canViewUsers ? (
          <Link href={`/users/${h.userId}`} className="font-mono text-xs hover:underline">
            {h.userId.slice(0, 8)}
          </Link>
        ) : (
          <span className="font-mono text-xs">{h.userId.slice(0, 8)}</span>
        ),
    },
    {
      id: "reason",
      header: "Reason",
      className: "max-w-72 truncate",
      cell: (h) => h.reason,
    },
    {
      id: "transaction",
      header: "Transaction",
      priority: "tertiary",
      cell: (h) =>
        h.transactionReference ? (
          <Link
            href={`/transactions/${encodeURIComponent(h.transactionReference)}`}
            className="font-mono text-xs hover:underline"
          >
            {h.transactionReference}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "createdAt",
      header: "Placed",
      priority: "secondary",
      cell: (h) => <DateTime value={h.createdAt} />,
    },
    {
      id: "actions",
      header: "Release",
      required: true,
      align: "right",
      cell: (h) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setReleasing(h);
          }}
        >
          <HandIcon aria-hidden />
          Release
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            setPlacing(true);
          }}
        >
          <PlusIcon aria-hidden />
          Place hold
        </Button>
        <div className="ml-auto">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>
      <DataTable
        label="Active holds"
        subject="active holds"
        columns={columns}
        rows={result.data ?? []}
        getRowId={(h) => h.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        empty={{
          icon: LockIcon,
          title: "No active holds",
          description: "Money held on a customer's balance appears here until it is released.",
        }}
      />
      <PlaceHoldDialog open={placing} onOpenChange={setPlacing} />
      <ConfirmActionDialog
        open={releasing !== null}
        onOpenChange={(open) => {
          if (!open) setReleasing(null);
        }}
        title="Release hold"
        target={
          releasing && (
            <span className="grid">
              <span className="font-medium">
                {releasing.assetType === "CRYPTO"
                  ? formatAmount(releasing.amountCrypto, releasing.currency)
                  : formatAmount(releasing.amountNaira, "NGN")}
              </span>
              <span className="text-xs text-muted-foreground">{releasing.reason}</span>
            </span>
          )
        }
        impact="The held amount becomes spendable again immediately. If the hold belongs to an open case, the case stays open."
        confirmLabel="Release"
        reason={{
          required: true,
          minLength: 5,
          hint: "Recorded with the hold and in the audit log.",
        }}
        onConfirm={({ reason }) =>
          releasing ? release.mutateAsync({ id: releasing.id, reason }) : Promise.resolve()
        }
      />
    </div>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Places a naira hold. Also opened from a customer's page with the user prefilled. */
export function PlaceHoldDialog({
  open,
  onOpenChange,
  userId: fixedUserId,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  customer?: string;
}) {
  const refresh = useRefreshRisk();
  const [userId, setUserId] = useState(fixedUserId ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? `Place hold: ${customer}` : "Place hold"}
      description="Holds part of the customer's naira balance so it cannot be spent. The rest of the balance is unaffected. The customer is shown your reason."
      submitLabel="Place hold"
      tone="danger"
      validate={() => {
        if (!UUID.test(userId.trim())) return "Enter the customer's user ID.";
        if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0)
          return "Enter an amount in naira, e.g. 50000.";
        if (reason.trim().length < 10) return "The reason must be at least 10 characters.";
        if (!password) return "Enter your password.";
        if (!/^\d{6}$/.test(code.trim()))
          return "Enter the 6-digit code from your authenticator app.";
        return null;
      }}
      onSubmit={async () => {
        const result = await placeHold({
          userId: userId.trim(),
          amountNaira: amount.trim(),
          reason: reason.trim(),
          transactionReference: reference.trim() || undefined,
          password,
          twoFACode: code.trim(),
        });
        toast.success(result.message || "Hold placed");
        setAmount("");
        setReason("");
        setPassword("");
        setCode("");
        await refresh();
      }}
    >
      {!fixedUserId && (
        <Field id="hold-user" label="Customer user ID" hint="Copy it from the customer's page.">
          <Input
            id="hold-user"
            className="font-mono text-xs"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
            }}
          />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="hold-amount" label="Amount (₦)">
          <Input
            id="hold-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
          />
        </Field>
        <Field id="hold-reference" label="Transaction reference (optional)">
          <Input
            id="hold-reference"
            className="font-mono text-xs"
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
            }}
          />
        </Field>
      </div>
      <Field id="hold-reason" label="Reason shown to the customer" hint="At least 10 characters.">
        <Textarea
          id="hold-reason"
          value={reason}
          maxLength={500}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="hold-password" label="Your password">
          <Input
            id="hold-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </Field>
        <Field id="hold-2fa" label="Authenticator code">
          <Input
            id="hold-2fa"
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
