"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EyeIcon,
  EyeOffIcon,
  ListChecksIcon,
  PlusIcon,
  ShieldQuestionIcon,
  TimerIcon,
} from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormDialog } from "@/components/confirm/form-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn } from "@/components/data-table/types";
import { DetailList } from "@/components/detail/detail-list";
import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { SEVERITY_TONE } from "@/features/compliance/labels";
import { Metric } from "@/features/overview/metric";
import { humanizeEnum } from "@/lib/format";

import { WATCHLIST_CATEGORY_LABEL, WATCHLIST_ENTITY_LABEL, WATCHLIST_STATUS_TONE } from "./labels";
import {
  addWatchlistEntry,
  fetchWatchlist,
  removeWatchlistEntry,
  reviewWatchlistEntry,
  WATCHLIST_CATEGORIES,
  WATCHLIST_ENTITY_TYPES,
  WATCHLIST_SEVERITIES,
  WATCHLIST_STATUSES,
  type WatchlistCategory,
  type WatchlistEntityType,
  type WatchlistEntry,
} from "./watchlist-api";

/**
 * The internal watchlist.
 *
 * Presented as what it is throughout: entries this business made, each with a
 * named author and a stated reason. Where an entry came from an external
 * provider the provider is shown next to it — an internal suspicion and a
 * third-party screening hit are different kinds of evidence and must never
 * read as the same one.
 *
 * `Never matched` is given a metric tile of its own because it is the number
 * that keeps the list usable. Entries that have sat active for a month
 * matching nothing are what make a watchlist expensive to maintain and easy to
 * ignore, and nobody prunes them without being shown the count.
 */
export function WatchlistPanel() {
  const [state, setState] = useQueryStates(
    {
      entityType: parseAsStringLiteral(WATCHLIST_ENTITY_TYPES),
      category: parseAsStringLiteral(WATCHLIST_CATEGORIES),
      status: parseAsStringLiteral(WATCHLIST_STATUSES),
      severity: parseAsStringLiteral(WATCHLIST_SEVERITIES),
      q: parseAsString,
    },
    { clearOnDefault: true },
  );
  const [open, setOpen] = useState<WatchlistEntry | null>(null);
  const [dialog, setDialog] = useState<"add" | "remove" | "review" | null>(null);

  const result = useQuery({
    queryKey: ["risk", "watchlist", state],
    queryFn: ({ signal }) =>
      fetchWatchlist(
        {
          entityType: state.entityType,
          category: state.category,
          status: state.status,
          severity: state.severity,
          search: state.q,
        },
        signal,
      ),
  });

  const rows = result.data?.rows ?? [];
  const stats = result.data?.stats;
  const current = open ? (rows.find((r) => r.id === open.id) ?? open) : null;

  const columns: DataColumn<WatchlistEntry>[] = [
    {
      id: "entity",
      header: "Entity",
      required: true,
      // The value is the identifying data — an account number, an address, a
      // phone. Flagged sensitive so it is excluded from exports by default.
      sensitive: true,
      cell: (e) => (
        <span className="grid leading-tight">
          <span className="font-mono text-xs">{e.label || e.entityValue}</span>
          <span className="text-xs text-muted-foreground">
            {WATCHLIST_ENTITY_LABEL[e.entityType] ?? humanizeEnum(e.entityType)}
          </span>
        </span>
      ),
      exportValue: (e) => e.entityValue,
    },
    {
      id: "category",
      header: "Category",
      cell: (e) => WATCHLIST_CATEGORY_LABEL[e.category] ?? humanizeEnum(e.category),
      exportValue: (e) => e.category,
    },
    {
      id: "severity",
      header: "Severity",
      cell: (e) => (
        <Badge tone={SEVERITY_TONE[e.severity] ?? "neutral"}>{humanizeEnum(e.severity)}</Badge>
      ),
      exportValue: (e) => e.severity,
    },
    {
      id: "status",
      header: "Status",
      cell: (e) => (
        <Badge tone={WATCHLIST_STATUS_TONE[e.status] ?? "neutral"}>{humanizeEnum(e.status)}</Badge>
      ),
      exportValue: (e) => e.status,
    },
    {
      id: "matches",
      header: "Matches",
      align: "right",
      description: "How many times this entry has actually been hit by a screened event.",
      cell: (e) => <span className="tabular-nums">{e.matchCount}</span>,
      exportValue: (e) => e.matchCount,
      sortKey: "matchCount",
      sortValue: (e) => e.matchCount,
    },
    {
      id: "source",
      header: "Source",
      priority: "secondary",
      description: "The external provider, where the entry did not originate here.",
      cell: (e) => e.source ?? <span className="text-muted-foreground">Internal</span>,
      exportValue: (e) => e.source ?? "internal",
    },
    {
      id: "createdAt",
      header: "Added",
      priority: "tertiary",
      cell: (e) => <DateTime value={e.createdAt} />,
      exportValue: (e) => e.createdAt,
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <section aria-label="Watchlist summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Active entries"
          value={stats?.active}
          icon={EyeIcon}
          isPending={result.isPending}
          isError={result.isError}
          definition="Entries currently screened against every assessed event."
        />
        <Metric
          label="Matches · 30 days"
          value={stats?.matchesLast30Days}
          icon={ListChecksIcon}
          isPending={result.isPending}
          isError={result.isError}
          definition="Entries hit by at least one screened event in the last 30 days."
        />
        <Metric
          label="Never matched"
          value={stats?.neverMatched}
          icon={ShieldQuestionIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition="Active for over 30 days and never matched. Candidates for review — a list that only grows stops being read."
        />
        <Metric
          label="Expiring soon"
          value={stats?.expiringSoon}
          icon={TimerIcon}
          attention
          isPending={result.isPending}
          isError={result.isError}
          definition="Active entries whose expiry falls within 7 days."
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={state.q ?? ""}
          onChange={(q) => void setState({ q: q || null })}
          placeholder="Value, label or reason"
        />
        <SelectFilter
          label="Type"
          value={state.entityType}
          options={WATCHLIST_ENTITY_TYPES.map((value) => ({
            value,
            label: WATCHLIST_ENTITY_LABEL[value] ?? humanizeEnum(value),
          }))}
          onChange={(entityType) => void setState({ entityType })}
        />
        <SelectFilter
          label="Category"
          value={state.category}
          options={WATCHLIST_CATEGORIES.map((value) => ({
            value,
            label: WATCHLIST_CATEGORY_LABEL[value] ?? humanizeEnum(value),
          }))}
          onChange={(category) => void setState({ category })}
        />
        <SelectFilter
          label="Status"
          value={state.status}
          options={WATCHLIST_STATUSES.map((value) => ({ value, label: humanizeEnum(value) }))}
          onChange={(status) => void setState({ status })}
        />
        <Button
          size="sm"
          onClick={() => {
            setDialog("add");
          }}
        >
          <PlusIcon aria-hidden />
          Add entry
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
        label="Internal watchlist"
        subject="watchlist entries"
        columns={columns}
        rows={rows}
        getRowId={(e) => e.id}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={open?.id}
        empty={{
          icon: EyeOffIcon,
          title: "Nothing on the watchlist",
          description:
            "Accounts, bank accounts, addresses and devices added here are screened against every assessed event.",
        }}
      />

      <AddEntryDialog
        open={dialog === "add"}
        onOpenChange={(v) => {
          setDialog(v ? "add" : null);
        }}
      />

      <Sheet
        open={current !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        {current && (
          <SheetContent className="sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>{current.label || current.entityValue}</SheetTitle>
              <SheetDescription>
                {WATCHLIST_ENTITY_LABEL[current.entityType] ?? humanizeEnum(current.entityType)}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <EntryDetail entry={current} onAction={setDialog} />
            </SheetBody>
          </SheetContent>
        )}
      </Sheet>

      {current && (
        <>
          <ReviewDialog
            entry={current}
            open={dialog === "review"}
            onOpenChange={(v) => {
              setDialog(v ? "review" : null);
            }}
          />
          <RemoveDialog
            entry={current}
            open={dialog === "remove"}
            onOpenChange={(v) => {
              setDialog(v ? "remove" : null);
            }}
            onRemoved={() => {
              setOpen(null);
            }}
          />
        </>
      )}
    </div>
  );
}

function EntryDetail({
  entry,
  onAction,
}: {
  entry: WatchlistEntry;
  onAction: (dialog: "review" | "remove") => void;
}) {
  const removed = entry.status === "REMOVED";
  return (
    <div className="grid gap-4">
      <DetailList
        items={[
          { label: "Value", value: <span className="font-mono text-xs">{entry.entityValue}</span> },
          {
            label: "Category",
            value: WATCHLIST_CATEGORY_LABEL[entry.category] ?? humanizeEnum(entry.category),
          },
          {
            label: "Severity",
            value: (
              <Badge tone={SEVERITY_TONE[entry.severity] ?? "neutral"}>
                {humanizeEnum(entry.severity)}
              </Badge>
            ),
          },
          {
            label: "Status",
            value: (
              <Badge tone={WATCHLIST_STATUS_TONE[entry.status] ?? "neutral"}>
                {humanizeEnum(entry.status)}
              </Badge>
            ),
          },
          { label: "Reason", value: entry.reason },
          {
            label: "Source",
            value: entry.source,
            hint: "Named provider where this came from a third party. Blank means an internal decision.",
            hideWhenEmpty: !entry.source,
          },
          {
            label: "Provider reference",
            value: entry.sourceReference,
            hideWhenEmpty: !entry.sourceReference,
          },
          {
            label: "Screened at",
            value: <DateTime value={entry.sourceScreenedAt} />,
            hideWhenEmpty: !entry.sourceScreenedAt,
          },
          { label: "Added by", value: entry.addedByEmail },
          { label: "Added", value: <DateTime value={entry.createdAt} /> },
          { label: "Matches", value: entry.matchCount },
          {
            label: "Last matched",
            value: <DateTime value={entry.lastMatchedAt} />,
            hideWhenEmpty: !entry.lastMatchedAt,
          },
          {
            label: "Expires",
            value: <DateTime value={entry.expiresAt} />,
            hideWhenEmpty: !entry.expiresAt,
          },
          {
            label: "Review note",
            value: entry.reviewNote,
            hideWhenEmpty: !entry.reviewNote,
          },
          {
            label: "Removed",
            value: entry.removalReason,
            hideWhenEmpty: !removed,
          },
        ]}
      />
      {!removed && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onAction("review");
            }}
          >
            Record a review
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onAction("remove");
            }}
          >
            Remove from watchlist
          </Button>
        </div>
      )}
    </div>
  );
}

function AddEntryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<WatchlistEntityType>("BANK_ACCOUNT");
  const [entityValue, setEntityValue] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<WatchlistCategory>("INTERNAL_REVIEW");
  const [severity, setSeverity] = useState<string>("MEDIUM");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  function reset() {
    setEntityValue("");
    setLabel("");
    setReason("");
    setSource("");
    setExpiresAt("");
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Add to the internal watchlist"
      description="Entries are screened against every assessed event. A match raises a signal for review — it never blocks anything on its own."
      submitLabel="Add entry"
      validate={() => {
        if (!entityValue.trim()) return "Give the value to watch.";
        if (reason.trim().length < 10) return "Give a reason of at least 10 characters.";
        return null;
      }}
      onSubmit={async () => {
        await addWatchlistEntry({
          entityType,
          entityValue: entityValue.trim(),
          label: label.trim() || undefined,
          category,
          severity,
          reason: reason.trim(),
          source: source.trim() || undefined,
          expiresAt: expiresAt || undefined,
        });
        toast.success("Added to the watchlist.");
        reset();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["risk", "watchlist"] }),
          queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
        ]);
      }}
    >
      <Field id="wl-type" label="What are you watching?">
        <Select
          value={entityType}
          onValueChange={(next) => {
            setEntityType(next as WatchlistEntityType);
          }}
        >
          <SelectTrigger id="wl-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WATCHLIST_ENTITY_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {WATCHLIST_ENTITY_LABEL[value] ?? humanizeEnum(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        id="wl-value"
        label="Value"
        hint="Bank accounts and phone numbers are normalised to digits; wallet addresses are kept exactly as entered."
      >
        <Input
          id="wl-value"
          value={entityValue}
          onChange={(event) => {
            setEntityValue(event.target.value);
          }}
        />
      </Field>
      <Field id="wl-label" label="Label (optional)">
        <Input
          id="wl-label"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          placeholder="Zenith 0123456789 · J. Doe"
        />
      </Field>
      <Field id="wl-category" label="Category">
        <Select
          value={category}
          onValueChange={(next) => {
            setCategory(next as WatchlistCategory);
          }}
        >
          <SelectTrigger id="wl-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WATCHLIST_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {WATCHLIST_CATEGORY_LABEL[value] ?? humanizeEnum(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="wl-severity" label="Severity">
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger id="wl-severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WATCHLIST_SEVERITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {humanizeEnum(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        id="wl-reason"
        label="Reason"
        hint="Required. An entry nobody can justify is one nobody is willing to remove."
      >
        <Textarea
          id="wl-reason"
          rows={3}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
      <Field
        id="wl-source"
        label="External provider (optional)"
        hint="Name the provider if this came from external screening, so it is never read as an internal judgement."
      >
        <Input
          id="wl-source"
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
          }}
          placeholder="e.g. Dojah"
        />
      </Field>
      <Field
        id="wl-expires"
        label="Expires (optional)"
        hint="Most reasons for watching something are temporary. An expiry keeps the list readable."
      >
        <Input
          id="wl-expires"
          type="date"
          value={expiresAt}
          onChange={(event) => {
            setExpiresAt(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

function ReviewDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: WatchlistEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"ACTIVE" | "UNDER_REVIEW">("UNDER_REVIEW");
  const [note, setNote] = useState("");

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setNote("");
      }}
      title="Record a review"
      description="Reviews are kept on the entry so the reason it is still listed stays current."
      submitLabel="Record review"
      validate={() => (note.trim().length < 10 ? "Give a note of at least 10 characters." : null)}
      onSubmit={async () => {
        await reviewWatchlistEntry(entry.id, { status, note: note.trim() });
        toast.success("Review recorded.");
        setNote("");
        await queryClient.invalidateQueries({ queryKey: ["risk", "watchlist"] });
      }}
    >
      <Field id="wl-review-status" label="Status after review">
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus(next as "ACTIVE" | "UNDER_REVIEW");
          }}
        >
          <SelectTrigger id="wl-review-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active — keep screening</SelectItem>
            <SelectItem value="UNDER_REVIEW">Under review</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field id="wl-review-note" label="Note">
        <Textarea
          id="wl-review-note"
          rows={3}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

function RemoveDialog({
  entry,
  open,
  onOpenChange,
  onRemoved,
}: {
  entry: WatchlistEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const remove = useMutation({
    mutationFn: () => removeWatchlistEntry(entry.id, reason.trim()),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setReason("");
      }}
      title="Remove from the watchlist"
      description="The entry stops being screened but is kept, with this reason, so the decision to stop watching stays on the record."
      submitLabel="Remove"
      tone="danger"
      validate={() =>
        reason.trim().length < 10 ? "Give a removal reason of at least 10 characters." : null
      }
      onSubmit={async () => {
        await remove.mutateAsync();
        toast.success("Entry removed from screening.");
        setReason("");
        onRemoved();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["risk", "watchlist"] }),
          queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
        ]);
      }}
    >
      <Field id="wl-remove-reason" label="Reason">
        <Textarea
          id="wl-remove-reason"
          rows={3}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}
