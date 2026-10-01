"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRightIcon,
  ClipboardCheckIcon,
  ExternalLinkIcon,
  GaugeIcon,
  HistoryIcon,
  MessageSquarePlusIcon,
  NetworkIcon,
  ShieldAlertIcon,
  UserCheckIcon,
  WaypointsIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { DetailList } from "@/components/detail/detail-list";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasPermission } from "@/features/auth/admin-context";
import { SEVERITY_TONE } from "@/features/compliance/labels";
import { humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  addCaseNote,
  assignCase,
  type CaseDossier,
  type CaseEvent,
  type ChecklistItem,
  type ChecklistState,
  escalateCase,
  fetchAssignableAdmins,
  fetchCaseDossier,
  updateCaseChecklist,
} from "./investigation-api";
import { caseEventMeta, CHECKLIST_STATE_LABEL, engineRuleDescription } from "./labels";
import { NetworkPanel } from "./network-panel";

/**
 * The investigation workspace.
 *
 * WHY A SINGLE SURFACE
 *
 * The question an investigator answers is never "what is this case" — it is
 * "why was this flagged, what changed from normal, who is connected, and what
 * am I permitted to do". Answering it across five screens means the person
 * under time pressure holds the context in their head and loses it every time
 * they navigate.
 *
 * So everything is here: the reasoning behind the flag, the money, the
 * history, the relationships, and the record of what has been done. Tabs
 * rather than one long column, because an investigator returning to a case
 * goes straight to the part they were on.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It renders no verdict. Risk scores are shown with their composition, never
 * alone; relationships are shown with the reason they might be innocent; and
 * no label anywhere calls a customer anything. Determinations are recorded by
 * the investigator, in their own words, on the decision path.
 */

const CASE_STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  OPEN: "warning",
  AWAITING_CUSTOMER: "info",
  UNDER_REVIEW: "info",
  CLEARED: "success",
  CONFIRMED: "danger",
  CLOSED: "neutral",
};

const QUEUES = ["FRAUD", "AML", "SECURITY", "OPERATIONS", "COMPLIANCE"] as const;

export function InvestigationSheet({
  caseId,
  onOpenChange,
}: {
  caseId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const result = useQuery({
    queryKey: ["risk", "dossier", caseId],
    queryFn: ({ signal }) => fetchCaseDossier(caseId as string, signal),
    enabled: caseId !== null,
  });

  return (
    <Sheet open={caseId !== null} onOpenChange={onOpenChange}>
      {caseId !== null && (
        <SheetContent className="sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{result.data?.case.reference ?? "Investigation"}</SheetTitle>
            <SheetDescription>
              {result.data?.case.trigger ?? "Loading the case record…"}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {result.isPending && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading the case record…
              </p>
            )}
            {result.isError && (
              <EmptyState
                icon={ShieldAlertIcon}
                title="Could not load this case"
                description="The case record is unavailable. Retry, or check that it still exists."
                action={
                  <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
                    Retry
                  </Button>
                }
              />
            )}
            {result.data && <Workspace dossier={result.data} caseId={caseId} />}
          </SheetBody>
        </SheetContent>
      )}
    </Sheet>
  );
}

function Workspace({ dossier, caseId }: { dossier: CaseDossier; caseId: string }) {
  const canViewUsers = useHasPermission("users.view");
  const c = dossier.case;

  return (
    <div className="grid gap-4">
      <CaseSummary dossier={dossier} canViewUsers={canViewUsers} />

      <Tabs defaultValue="why">
        <TabsList>
          <TabsTrigger value="why">
            <GaugeIcon aria-hidden />
            Why flagged
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <HistoryIcon aria-hidden />
            History
          </TabsTrigger>
          <TabsTrigger value="checklist">
            <ClipboardCheckIcon aria-hidden />
            Checklist
          </TabsTrigger>
          <TabsTrigger value="network">
            <NetworkIcon aria-hidden />
            Network
          </TabsTrigger>
        </TabsList>

        <TabsContent value="why">
          <WhyFlagged dossier={dossier} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelinePanel caseId={caseId} events={dossier.timeline} status={c.status} />
        </TabsContent>
        <TabsContent value="checklist">
          <ChecklistPanel caseId={caseId} items={dossier.checklist} />
        </TabsContent>
        <TabsContent value="network">
          <NetworkPanel userId={c.userId} compact />
        </TabsContent>
      </Tabs>

      <OwnershipActions dossier={dossier} caseId={caseId} />
    </div>
  );
}

/** The identifying facts, above the tabs, so they never scroll away. */
function CaseSummary({ dossier, canViewUsers }: { dossier: CaseDossier; canViewUsers: boolean }) {
  const c = dossier.case;
  const user = dossier.user;
  const name = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || (user.email ?? c.userId)
    : c.userId;
  const overdue =
    c.dueAt !== null &&
    new Date(c.dueAt) < new Date() &&
    ["OPEN", "AWAITING_CUSTOMER", "UNDER_REVIEW"].includes(c.status);

  return (
    <section className="grid gap-3 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[c.severity] ?? "neutral"}>{humanizeEnum(c.severity)}</Badge>
        <Badge tone={CASE_STATUS_TONE[c.status] ?? "neutral"}>{humanizeEnum(c.status)}</Badge>
        {c.queue && <Badge tone="neutral">{humanizeEnum(c.queue)} queue</Badge>}
        {c.escalatedAt && (
          <Badge tone="warning">
            <ArrowUpRightIcon aria-hidden />
            Escalated
          </Badge>
        )}
        {overdue && <Badge tone="danger">Overdue</Badge>}
      </div>

      <DetailList
        columns={2}
        items={[
          {
            label: "Customer",
            value: canViewUsers ? (
              <Link href={`/users/${c.userId}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            ),
          },
          {
            label: "Balance",
            value: <Amount value={user?.walletBalance} currency="NGN" />,
            hideWhenEmpty: !user,
          },
          {
            label: "Held",
            value: <Amount value={c.heldAmountNaira} currency="NGN" />,
            hint: "Held, not taken. The rest of the balance stays spendable.",
            hideWhenEmpty: !c.heldAmountNaira || Number(c.heldAmountNaira) === 0,
          },
          {
            label: "Owner",
            value: dossier.assignee?.name || dossier.assignee?.email || "Unassigned",
          },
          { label: "Opened", value: <DateTime value={c.createdAt} /> },
          {
            label: "Due",
            value: (
              <span className={overdue ? "font-medium text-warning" : undefined}>
                <DateTime value={c.dueAt} />
              </span>
            ),
            hideWhenEmpty: !c.dueAt,
          },
          {
            label: "Account controls",
            value: user
              ? [
                  user.isBlocked && "Blocked",
                  user.isSuspended && "Suspended",
                  user.outboundRestricted && "Outbound restricted",
                ]
                  .filter(Boolean)
                  .join(", ") || "None"
              : null,
            hideWhenEmpty: !user,
          },
        ]}
      />
    </section>
  );
}

/**
 * The explanation.
 *
 * Section 91 of the specification, and the most important panel here: an
 * alert nobody can justify is an alert that gets cleared unread. Every number
 * shown comes from a recorded assessment or alert — nothing is recomputed in
 * the browser, so what the investigator reads is what the engine actually saw
 * at decision time.
 */
function WhyFlagged({ dossier }: { dossier: CaseDossier }) {
  const c = dossier.case;
  const pt = dossier.passThrough;
  // Assessments are returned newest-first; the ones that intervened are the
  // ones that explain the case.
  const decisive = dossier.assessments.filter((a) =>
    ["STEP_UP", "HOLD_TRANSACTION", "RESTRICT_OUTBOUND", "FREEZE_ACCOUNT"].includes(a.action),
  );
  const shown = (decisive.length ? decisive : dossier.assessments).slice(0, 5);

  return (
    <div className="grid gap-4 pt-2">
      {c.description && (
        <section className="grid gap-1.5 rounded-md border border-warning/25 bg-warning/5 p-3">
          <h3 className="text-sm font-medium">What triggered this case</h3>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{c.description}</p>
        </section>
      )}

      {c.riskScore !== null && c.riskScore !== undefined && (
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">
            Risk score at the time: <span className="tabular-nums">{c.riskScore}</span> / 100
          </h3>
          <p className="text-xs text-muted-foreground">
            A score is the sum of the signals below. It measures how unusual the activity was, not
            whether anything wrong happened.
          </p>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Signals recorded on this account</h3>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No engine assessments are recorded for this customer.
          </p>
        ) : (
          <ul className="grid gap-2">
            {shown.map((a) => (
              <li key={a.id} className="grid gap-1.5 rounded-md border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {humanizeEnum(a.eventType)} · <Amount value={a.amountNaira} currency="NGN" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Score {a.riskScore} · {humanizeEnum(a.action)} ·{" "}
                    <DateTime value={a.createdAt} />
                  </span>
                </div>
                <ul className="grid gap-1">
                  {a.signals.map((s, index) => {
                    const description = engineRuleDescription(s.rule);
                    return (
                      <li
                        key={`${a.id}-${s.rule}-${index}`}
                        className="grid grid-cols-[3rem_1fr] gap-2 text-xs"
                      >
                        <span className="text-muted-foreground tabular-nums">
                          {s.points > 0 ? `+${s.points}` : "—"}
                        </span>
                        <span>
                          {description ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted underline-offset-2">
                                  {humanizeEnum(s.rule)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{description}</TooltipContent>
                            </Tooltip>
                          ) : (
                            humanizeEnum(s.rule)
                          )}
                          <span className="text-muted-foreground"> — {s.detail}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pt && (
        <section className="grid gap-2 rounded-md border p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <WaypointsIcon className="size-4 text-muted-foreground" aria-hidden />
            Money flow · last {pt.windowDays} days
          </h3>
          <DetailList
            columns={2}
            items={[
              { label: "In", value: <Amount value={pt.inflowNaira} currency="NGN" /> },
              { label: "Out", value: <Amount value={pt.outflowNaira} currency="NGN" /> },
              { label: "Retained", value: <Amount value={pt.retainedNaira} currency="NGN" /> },
              {
                label: "Pass-through",
                value: `${Math.round(pt.passThroughRatio * 100)}%`,
                hint: "Outflow as a share of inflow over the window. Near 100% means funds do not stay.",
              },
              {
                label: "Average hold",
                value:
                  pt.averageHoldingHours === null
                    ? null
                    : pt.averageHoldingHours < 1
                      ? `${Math.round(pt.averageHoldingHours * 60)} minutes`
                      : `${pt.averageHoldingHours.toFixed(1)} hours`,
                hint: "Mean gap between funds arriving and the next outbound transaction.",
                hideWhenEmpty: pt.averageHoldingHours === null,
              },
              { label: "Destinations", value: pt.distinctDestinations },
            ]}
          />
          <p className="text-xs text-muted-foreground">{pt.interpretation}</p>
        </section>
      )}

      {dossier.alerts.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Monitoring alerts on this customer</h3>
          <ul className="grid gap-1.5">
            {dossier.alerts.slice(0, 10).map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-md border p-2.5"
              >
                <span className="grid gap-0.5">
                  <span className="text-sm">{humanizeEnum(a.rule)}</span>
                  <span className="text-xs text-muted-foreground">{a.summary}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={SEVERITY_TONE[a.severity] ?? "neutral"}>
                    {humanizeEnum(a.severity)}
                  </Badge>
                  <Badge tone="neutral">{humanizeEnum(a.status)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The case history, and the only place a note can be added.
 *
 * Append-only, top to bottom in the order things happened — an investigation
 * reads as a sequence, and newest-first breaks the one thing the panel is for.
 */
function TimelinePanel({
  caseId,
  events,
  status,
}: {
  caseId: string;
  events: CaseEvent[];
  status: string;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const closed = ["CLEARED", "CONFIRMED", "CLOSED"].includes(status);

  const addNote = useMutation({
    mutationFn: () => addCaseNote(caseId, { body: note.trim() }),
    onSuccess: async () => {
      setNote("");
      toast.success("Note added to the case record.");
      await queryClient.invalidateQueries({ queryKey: ["risk", "dossier", caseId] });
    },
    onError: () => toast.error("The note could not be saved."),
  });

  return (
    <div className="grid gap-3 pt-2">
      {events.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nothing recorded yet"
          description="Assignments, notes, evidence and decisions appear here as they happen."
        />
      ) : (
        <ol className="grid gap-0">
          {events.map((event, index) => {
            const meta = caseEventMeta(event.type);
            const Icon = meta.icon;
            const last = index === events.length - 1;
            return (
              <li key={event.id} className="grid grid-cols-[1.75rem_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  {!last && <span className="w-px flex-1 bg-border" aria-hidden />}
                </div>
                <div className={cn("grid gap-0.5", last ? "pb-1" : "pb-4")}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{event.summary}</span>
                    {event.visibility === "CUSTOMER_VISIBLE" && (
                      <Badge tone="info">Customer-visible</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <DateTime value={event.createdAt} />
                    {" · "}
                    {event.actorType === "SYSTEM"
                      ? "System"
                      : event.actorType === "CUSTOMER"
                        ? "Customer"
                        : (event.actorEmail ?? "Administrator")}
                  </span>
                  {event.body && (
                    <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
                      {event.body}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid gap-2 border-t pt-3">
        <label htmlFor="case-note" className="text-sm font-medium">
          Add an internal note
        </label>
        <Textarea
          id="case-note"
          rows={3}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          placeholder="What you checked, what you found, what you concluded."
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Notes cannot be edited or deleted once saved.{" "}
            {closed && "This case is closed; notes are still recorded."}
          </p>
          <Button
            size="sm"
            disabled={note.trim().length < 3 || addNote.isPending}
            onClick={() => {
              addNote.mutate();
            }}
          >
            <MessageSquarePlusIcon aria-hidden />
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The investigation checklist.
 *
 * Not bureaucracy: it is what makes two investigators' work comparable, and
 * what the closure gate measures on high-severity cases. "Not applicable" is
 * a real answer — a checklist that only accepts "done" gets ticked through
 * without being read.
 */
function ChecklistPanel({ caseId, items }: { caseId: string; items: ChecklistItem[] }) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (input: { key: string; state: ChecklistState }) =>
      updateCaseChecklist(caseId, [input]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["risk", "dossier", caseId] });
    },
    onError: () => toast.error("The checklist could not be updated."),
  });

  const done = items.filter((i) => i.state !== "PENDING").length;

  return (
    <div className="grid gap-3 pt-2">
      <p className="text-xs text-muted-foreground">
        {done} of {items.length} steps resolved. High and critical cases cannot be dispositioned
        until at least half are resolved and the decision step is recorded.
      </p>
      <ul className="grid gap-1.5">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5"
          >
            <span className="grid gap-0.5">
              <span className="text-sm">{item.label}</span>
              {item.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Updated <DateTime value={item.updatedAt} />
                </span>
              )}
            </span>
            <Select
              value={item.state}
              onValueChange={(state) => {
                update.mutate({ key: item.key, state: state as ChecklistState });
              }}
            >
              <SelectTrigger className="w-44" aria-label={`${item.label} status`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["PENDING", "DONE", "NOT_APPLICABLE"] as const).map((state) => (
                  <SelectItem key={state} value={state}>
                    {CHECKLIST_STATE_LABEL[state]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Assignment and escalation. Both are routing decisions, never dispositions. */
function OwnershipActions({ dossier, caseId }: { dossier: CaseDossier; caseId: string }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"assign" | "escalate" | null>(null);
  const [assignee, setAssignee] = useState<string>(dossier.case.assignedToAdminId ?? "unassigned");
  const [queue, setQueue] = useState<string>(dossier.case.queue ?? "FRAUD");
  const [reason, setReason] = useState("");

  const admins = useQuery({
    queryKey: ["risk", "assignable-admins"],
    queryFn: ({ signal }) => fetchAssignableAdmins(signal),
    enabled: dialog === "assign" || dialog === "escalate",
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["risk", "dossier", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["risk", "cases"] }),
      queryClient.invalidateQueries({ queryKey: ["risk", "queues"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);
  };

  return (
    <div className="flex flex-wrap gap-2 border-t pt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDialog("assign");
        }}
      >
        <UserCheckIcon aria-hidden />
        {dossier.case.assignedToAdminId ? "Reassign" : "Assign"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDialog("escalate");
        }}
      >
        <ArrowUpRightIcon aria-hidden />
        Escalate
      </Button>
      <Button variant="ghost" size="sm" asChild className="ml-auto">
        <Link href={`/users/${dossier.case.userId}`}>
          Open customer
          <ExternalLinkIcon aria-hidden />
        </Link>
      </Button>

      <FormDialog
        open={dialog === "assign"}
        onOpenChange={(open) => {
          setDialog(open ? "assign" : null);
        }}
        title="Assign this case"
        description="Taking ownership of an unworked case moves it to under review, so the open queue keeps meaning 'nobody has looked'."
        submitLabel="Assign"
        onSubmit={async () => {
          await assignCase(caseId, {
            assignedToAdminId: assignee === "unassigned" ? null : assignee,
            queue,
          });
          toast.success("Case assigned.");
          await refresh();
        }}
      >
        <Field id="assign-to" label="Owner">
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="assign-to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Return to the unassigned queue</SelectItem>
              {(admins.data ?? []).map((admin) => (
                <SelectItem key={admin.id} value={admin.id}>
                  {admin.name || admin.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="assign-queue" label="Queue">
          <Select value={queue} onValueChange={setQueue}>
            <SelectTrigger id="assign-queue">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUEUES.map((q) => (
                <SelectItem key={q} value={q}>
                  {humanizeEnum(q)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <FormDialog
        open={dialog === "escalate"}
        onOpenChange={(open) => {
          setDialog(open ? "escalate" : null);
          if (!open) setReason("");
        }}
        title="Escalate this case"
        description="Escalation routes the case to someone more senior. It does not record a finding, and it never lowers the severity."
        submitLabel="Escalate"
        validate={() =>
          reason.trim().length < 10 ? "Give a reason of at least 10 characters." : null
        }
        onSubmit={async () => {
          await escalateCase(caseId, { reason: reason.trim(), queue });
          toast.success("Case escalated.");
          setReason("");
          await refresh();
        }}
      >
        <Field id="escalate-queue" label="Route to queue">
          <Select value={queue} onValueChange={setQueue}>
            <SelectTrigger id="escalate-queue">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUEUES.map((q) => (
                <SelectItem key={q} value={q}>
                  {humanizeEnum(q)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          id="escalate-reason"
          label="Reason"
          hint="Recorded on the case history and visible to whoever picks it up."
        >
          <Textarea
            id="escalate-reason"
            rows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </Field>
      </FormDialog>
    </div>
  );
}
