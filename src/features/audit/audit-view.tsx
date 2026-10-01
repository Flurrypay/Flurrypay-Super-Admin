"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardListIcon, FilterXIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo, useState } from "react";

import { ColumnCustomizer } from "@/components/data-table/column-customizer";
import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { useTablePreferences } from "@/components/data-table/use-table-preferences";
import { DetailList } from "@/components/detail/detail-list";
import { ExportDialog } from "@/components/export/export-dialog";
import { DATE_PRESETS, resolveDateRange } from "@/components/filters/date-range";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
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
import { useAdmin } from "@/features/auth/admin-context";
import { hasPermission, isSuperAdmin } from "@/features/auth/permissions";
import { humanizeEnum } from "@/lib/format";

import { type AuditEntry, fetchAuditLog } from "./api";
import { AuditChanges } from "./audit-changes";
import { AUDIT_ACTIONS, auditActionInfo, isSecretMetadataKey } from "./labels";

/** `GET /flurrypay-website-admin-financial/audit-logs` caps `limit` at 200. */
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 10_000;

function ActionBadge({ action }: { action: string }) {
  const info = auditActionInfo(action);
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

const TARGET_USER_KEYS = ["targetUserId", "userId"];
const TARGET_ADMIN_KEYS = ["targetAdminId"];

interface ResolvedTarget {
  type: string;
  id: string;
  label?: string;
}

/** The structured target where recorded, else one found in older entries' metadata. */
function resolveTarget(entry: AuditEntry): ResolvedTarget | null {
  const meta = entry.metadata ?? {};
  const adminEmail = typeof meta.targetAdminEmail === "string" ? meta.targetAdminEmail : undefined;
  if (entry.targetType && entry.targetId) {
    return {
      type: entry.targetType,
      id: entry.targetId,
      label: entry.targetType === "admin" ? adminEmail : undefined,
    };
  }
  const adminId = TARGET_ADMIN_KEYS.map((k) => meta[k]).find((v) => typeof v === "string");
  if (typeof adminId === "string") return { type: "admin", id: adminId, label: adminEmail };
  const userId = TARGET_USER_KEYS.map((k) => meta[k]).find((v) => typeof v === "string");
  if (typeof userId === "string") return { type: "user", id: userId };
  return null;
}

/** The recorded reason, or the one older entries kept in metadata. */
function entryReason(entry: AuditEntry): string | null {
  if (entry.reason) return entry.reason;
  return typeof entry.metadata?.reason === "string" ? entry.metadata.reason : null;
}

/** Links to the entity an action targeted. */
function AuditTarget({
  entry,
  canViewUsers,
  canViewAdmins,
  canViewTransactions,
}: {
  entry: AuditEntry;
  canViewUsers: boolean;
  canViewAdmins: boolean;
  canViewTransactions: boolean;
}) {
  const target = resolveTarget(entry);
  if (!target) return <span className="text-muted-foreground">—</span>;
  const short = target.id.length > 12 ? `${target.id.slice(0, 8)}…` : target.id;

  if (target.type === "admin") {
    const text = target.label ?? `Administrator ${short}`;
    return canViewAdmins ? (
      <Link href={`/administrators/${target.id}`} className="hover:underline">
        {text}
      </Link>
    ) : (
      <span>{text}</span>
    );
  }
  if (target.type === "user") {
    return canViewUsers ? (
      <Link href={`/users/${target.id}`} className="font-mono text-xs hover:underline">
        User {short}
      </Link>
    ) : (
      <span className="font-mono text-xs">User {short}</span>
    );
  }
  if (target.type === "role") {
    return canViewAdmins ? (
      <Link href="/administrators/roles" className="text-xs hover:underline">
        Role <span className="font-mono">{short}</span>
      </Link>
    ) : (
      <span className="text-xs">
        Role <span className="font-mono">{short}</span>
      </span>
    );
  }
  if (target.type === "transaction") {
    return canViewTransactions ? (
      <Link
        href={`/transactions/${encodeURIComponent(target.id)}`}
        className="font-mono text-xs hover:underline"
      >
        {target.id}
      </Link>
    ) : (
      <span className="font-mono text-xs">{target.id}</span>
    );
  }
  return (
    <span className="text-xs">
      {humanizeEnum(target.type)} <span className="font-mono">{short}</span>
    </span>
  );
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function MetadataView({ metadata }: { metadata: AuditEntry["metadata"] }) {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0)
    return <p className="text-sm text-muted-foreground">No additional details were recorded.</p>;
  return (
    <DetailList
      items={entries.map(([key, value]) => ({
        label: humanizeEnum(key),
        value: isSecretMetadataKey(key) ? (
          <span className="text-muted-foreground">Redacted</span>
        ) : (
          <pre className="font-mono text-xs whitespace-pre-wrap">{formatMetadataValue(value)}</pre>
        ),
      }))}
    />
  );
}

interface AuditTableProps {
  page: number;
  pageSize: number;
  search: string;
  action: string | null;
  adminId?: string | null;
  targetId?: string | null;
  /** Inclusive ISO instants. */
  from?: string | null;
  to?: string | null;
  /** Stable cache key for the date range (presets resolve against a moving "now"). */
  rangeKey?: string | null;
  /** Offered in the drawer to narrow the list to the entry's target. */
  onFilterTarget?: (targetId: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  tableId: string;
  toolbar?: React.ReactNode;
  emptyDescription?: string;
}

/** Server-paged audit trail with a detail drawer. Used by the Audit page and embedded on detail pages. */
export function AuditTable({
  page,
  pageSize,
  search,
  action,
  adminId,
  targetId,
  from,
  to,
  rangeKey,
  onFilterTarget,
  onPageChange,
  onPageSizeChange,
  tableId,
  toolbar,
  emptyDescription = "Administrator actions are recorded here as they happen.",
}: AuditTableProps) {
  const admin = useAdmin();
  const canViewUsers = hasPermission(admin, "users.view");
  const canViewAdmins = isSuperAdmin(admin);
  const canViewTransactions = hasPermission(admin, "transactions.view");
  const [open, setOpen] = useState<AuditEntry | null>(null);

  const columns = useMemo<DataColumn<AuditEntry>[]>(
    () => [
      {
        id: "createdAt",
        header: "When",
        required: true,
        cell: (e) => <DateTime value={e.createdAt} />,
        exportValue: (e) => e.createdAt,
      },
      {
        id: "admin",
        header: "Administrator",
        cell: (e) =>
          canViewAdmins ? (
            <Link href={`/administrators/${e.adminId}`} className="hover:underline">
              {e.adminEmail}
            </Link>
          ) : (
            e.adminEmail
          ),
        exportValue: (e) => e.adminEmail,
      },
      {
        id: "action",
        header: "Action",
        cell: (e) => <ActionBadge action={e.action} />,
        exportValue: (e) => e.action,
      },
      {
        id: "target",
        header: "Target",
        cell: (e) => (
          <AuditTarget
            entry={e}
            canViewUsers={canViewUsers}
            canViewAdmins={canViewAdmins}
            canViewTransactions={canViewTransactions}
          />
        ),
        exportValue: (e) => {
          const target = resolveTarget(e);
          return target ? `${target.type}:${target.id}` : null;
        },
        exportKeys: ["targetType", "targetId"],
      },
      {
        id: "reason",
        header: "Reason",
        priority: "secondary",
        className: "max-w-56 truncate",
        cell: (e) => entryReason(e) ?? <span className="text-muted-foreground">—</span>,
        exportValue: (e) => entryReason(e),
      },
      {
        id: "ip",
        header: "IP address",
        priority: "secondary",
        cell: (e) => <span className="font-mono text-xs">{e.ipAddress ?? "—"}</span>,
        exportValue: (e) => e.ipAddress,
      },
      {
        id: "userAgent",
        header: "Browser",
        defaultHidden: true,
        className: "max-w-64 truncate text-xs text-muted-foreground",
        cell: (e) => e.userAgent ?? "—",
        exportValue: (e) => e.userAgent,
        // Not included in server-generated exports.
        exportKeys: [],
      },
      {
        id: "requestId",
        header: "Request ID",
        defaultHidden: true,
        cell: (e) =>
          e.requestId ? <Identifier value={e.requestId} truncate label="request ID" /> : "—",
        exportValue: (e) => e.requestId,
      },
      {
        id: "id",
        header: "Entry ID",
        defaultHidden: true,
        cell: (e) => <Identifier value={e.id} truncate label="entry ID" />,
        exportValue: (e) => e.id,
      },
    ],
    [canViewAdmins, canViewUsers, canViewTransactions],
  );
  const preferences = useTablePreferences(tableId, columns);

  const filter = { search, action, adminId, targetId, from, to };
  const result = useQuery({
    queryKey: [
      "audit-log",
      { search, action, adminId, targetId, rangeKey: rangeKey ?? null, page, pageSize },
    ],
    queryFn: ({ signal }) => fetchAuditLog({ ...filter, page, pageSize }, signal),
    placeholderData: keepPreviousData,
  });
  const rows = result.data?.rows ?? [];
  const total = result.data?.total ?? 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
          <ColumnCustomizer preferences={preferences} />
          <ExportDialog
            dataset="audit-log"
            columns={preferences.orderedColumns}
            visibleColumnIds={preferences.visibleColumns.map((c) => c.id)}
            source={{
              pageRows: rows,
              selectedRows: [],
              totalMatching: total,
              maxRows: EXPORT_MAX_ROWS,
              loadAll: async (signal, onProgress) => {
                const all: AuditEntry[] = [];
                for (let page = 1; all.length < total; page++) {
                  const chunk = await fetchAuditLog(
                    { ...filter, page, pageSize: EXPORT_PAGE_SIZE },
                    signal,
                  );
                  all.push(...chunk.rows);
                  onProgress(all.length);
                  if (chunk.rows.length < EXPORT_PAGE_SIZE) break;
                }
                return all;
              },
            }}
          />
        </div>
      </div>
      <DataTable
        label="Audit log"
        subject="the audit log"
        columns={preferences.visibleColumns}
        rows={rows}
        getRowId={(e) => e.id}
        density={preferences.density}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={open?.id}
        empty={{
          icon: ClipboardListIcon,
          title: "No audit entries",
          description: emptyDescription,
        }}
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      <Sheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        {open && (
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{auditActionInfo(open.action).label}</SheetTitle>
              <SheetDescription>
                <DateTime value={open.createdAt} /> · {open.adminEmail}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="grid gap-5">
              <DetailList
                items={[
                  {
                    label: "Action",
                    value: <span className="font-mono text-xs">{open.action}</span>,
                  },
                  { label: "Category", value: auditActionInfo(open.action).category },
                  {
                    label: "Target",
                    value: (
                      <AuditTarget
                        entry={open}
                        canViewUsers={canViewUsers}
                        canViewAdmins={canViewAdmins}
                        canViewTransactions={canViewTransactions}
                      />
                    ),
                  },
                  { label: "Reason", value: entryReason(open) },
                  {
                    label: "IP address",
                    value: open.ipAddress ? (
                      <span className="font-mono text-xs">{open.ipAddress}</span>
                    ) : null,
                  },
                  { label: "Browser", value: open.userAgent },
                  {
                    label: "Request ID",
                    value: open.requestId ? (
                      <Identifier value={open.requestId} label="request ID" />
                    ) : null,
                  },
                  { label: "Entry ID", value: <Identifier value={open.id} label="entry ID" /> },
                ]}
              />
              {onFilterTarget && resolveTarget(open) && targetId !== resolveTarget(open)?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => {
                    const target = resolveTarget(open);
                    if (target) onFilterTarget(target.id);
                    setOpen(null);
                  }}
                >
                  Show all actions on this target
                </Button>
              )}
              {(open.before || open.after) && (
                <section className="grid gap-2">
                  <h3 className="text-sm font-medium">Changes</h3>
                  <AuditChanges before={open.before} after={open.after} />
                </section>
              )}
              <section className="grid gap-2">
                <h3 className="text-sm font-medium">Recorded details</h3>
                <MetadataView metadata={open.metadata} />
              </section>
            </SheetBody>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}

const ACTION_OPTIONS = Object.entries(AUDIT_ACTIONS)
  .map(([value, info]) => ({ value, label: info.label }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** The Audit log page: filters and paging held in the URL. */
export function AuditLogView() {
  const [state, setState] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(50),
      q: parseAsString.withDefault(""),
      action: parseAsString,
      target: parseAsString,
      range: parseAsStringLiteral([...DATE_PRESETS, "custom"] as const),
      from: parseAsString,
      to: parseAsString,
    },
    { clearOnDefault: true },
  );
  const active = Boolean(state.q || state.action || state.target || state.range);
  const range = resolveDateRange({ range: state.range, from: state.from, to: state.to });
  const rangeKey = state.range === "custom" ? `${state.from}..${state.to}` : state.range;

  return (
    <AuditTable
      tableId="audit"
      page={state.page}
      pageSize={state.size}
      search={state.q}
      action={state.action}
      targetId={state.target}
      from={range?.from.toISOString() ?? null}
      to={range?.to.toISOString() ?? null}
      rangeKey={rangeKey}
      onFilterTarget={(target) => void setState({ target, page: 1 })}
      onPageChange={(page) => void setState({ page })}
      onPageSizeChange={(size) => void setState({ size, page: 1 })}
      emptyDescription={active ? "No entries match these filters." : undefined}
      toolbar={
        <>
          <SearchInput
            value={state.q}
            onChange={(q) => void setState({ q, page: 1 })}
            placeholder="Search admin, IP, user ID, details…"
            description="Matches administrator email, action, IP address and recorded details."
          />
          <SelectFilter
            label="Action"
            value={state.action}
            options={ACTION_OPTIONS}
            onChange={(action) => void setState({ action, page: 1 })}
          />
          <DateRangeFilter
            value={{ range: state.range, from: state.from, to: state.to }}
            onChange={(value) => void setState({ ...value, page: 1 })}
          />
          {state.target && (
            <Badge tone="info" className="gap-1 pr-1">
              Target <span className="max-w-32 truncate font-mono">{state.target}</span>
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-foreground/10"
                aria-label="Remove target filter"
                onClick={() => void setState({ target: null, page: 1 })}
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            </Badge>
          )}
          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void setState({
                  q: "",
                  action: null,
                  target: null,
                  range: null,
                  from: null,
                  to: null,
                  page: 1,
                })
              }
            >
              <FilterXIcon aria-hidden />
              Clear filters
            </Button>
          )}
        </>
      }
    />
  );
}
