"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, ScanFaceIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo, useState } from "react";

import { ColumnCustomizer } from "@/components/data-table/column-customizer";
import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { useTablePreferences } from "@/components/data-table/use-table-preferences";
import { useTableUrlState } from "@/components/data-table/use-table-url-state";
import { ExportDialog } from "@/components/export/export-dialog";
import { SearchInput } from "@/components/filters/search-input";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Freshness } from "@/components/states/freshness";
import { resolveStatus } from "@/components/status/status-badge";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasPermission } from "@/features/auth/admin-context";
import { cn } from "@/lib/utils";

import { fetchKycQueue, KYC_FILTERS, type KycFilter, type KycProfile } from "./api";
import { KycSummary } from "./kyc-summary";
import { KYC_STATUS } from "./labels";

const FILTER_LABELS: Record<KycFilter, string> = {
  pending: "Awaiting review",
  verified: "Verified",
  rejected: "Rejected",
  all: "All",
};

function customerName(profile: KycProfile): string {
  if (!profile.user) return "Unknown customer";
  return `${profile.user.firstName} ${profile.user.lastName}`.trim() || profile.user.email;
}

function pendingLevels(profile: KycProfile): number[] {
  return ([1, 2, 3] as const).filter((level) => profile[`level${level}`].status === "PENDING");
}

/** The API orders by last update only. */
const SORT_KEYS: readonly string[] = [];
const EXPORT_MAX_ROWS = 10_000;
const EXPORT_PAGE_SIZE = 200;

function LevelStatus({ status }: { status: string }) {
  const info = resolveStatus(KYC_STATUS, status);
  const Icon = info.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-sm border",
            info.tone === "success" && "border-success/25 bg-success/8 text-success",
            info.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
            info.tone === "danger" && "border-destructive/25 bg-destructive/8 text-destructive",
            info.tone === "neutral" && "text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only">{info.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{info.label}</TooltipContent>
    </Tooltip>
  );
}

export function KycQueueView() {
  const canViewUsers = useHasPermission("users.view");
  const [filter, setFilter] = useQueryState(
    "filter",
    parseAsStringLiteral(KYC_FILTERS).withDefault("pending"),
  );
  const table = useTableUrlState({ sortKeys: SORT_KEYS });
  const [open, setOpen] = useState<KycProfile | null>(null);

  const query = { filter, search: table.search, page: table.page, pageSize: table.pageSize };
  const result = useQuery({
    queryKey: ["kyc-queue", query],
    queryFn: ({ signal }) => fetchKycQueue(query, signal),
    placeholderData: keepPreviousData,
  });
  const pageRows = result.data?.rows ?? [];
  const total = result.data?.total ?? 0;

  const columns = useMemo<DataColumn<KycProfile>[]>(
    () => [
      {
        id: "name",
        header: "Customer",
        required: true,
        cell: (p) => (
          <span className="grid leading-tight">
            <span className="truncate font-medium">{customerName(p)}</span>
            <span className="truncate text-xs text-muted-foreground">{p.user?.email}</span>
          </span>
        ),
        exportValue: (p) => p.user?.email,
      },
      {
        id: "awaiting",
        header: "Awaiting",
        description: "Levels submitted and waiting for an administrator decision.",
        cell: (p) => {
          const levels = pendingLevels(p);
          return levels.length > 0 ? (
            <span className="flex gap-1">
              {levels.map((level) => (
                <Badge key={level} tone="warning">
                  Level {level}
                </Badge>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
        exportValue: (p) => pendingLevels(p).join(" "),
      },
      {
        id: "levels",
        header: "L1 · L2 · L3",
        cell: (p) => (
          <span className="flex gap-1">
            <LevelStatus status={p.level1.status} />
            <LevelStatus status={p.level2.status} />
            <LevelStatus status={p.level3.status} />
          </span>
        ),
        exportValue: (p) => [p.level1.status, p.level2.status, p.level3.status].join(" / "),
      },
      {
        id: "flags",
        header: "Flags",
        priority: "secondary",
        cell: (p) =>
          p.level1.nameMismatch ? (
            <Badge tone="warning">
              <TriangleAlertIcon aria-hidden />
              Name mismatch
            </Badge>
          ) : null,
        exportValue: (p) => (p.level1.nameMismatch ? "name mismatch" : null),
      },
      {
        id: "currentLevel",
        header: "Current level",
        align: "right",
        cell: (p) => <span className="tabular-nums">{p.currentLevel}</span>,
        exportValue: (p) => p.currentLevel,
      },
      {
        id: "limit",
        header: "Daily limit",
        align: "right",
        priority: "secondary",
        cell: (p) => (
          <Amount value={p.dailyWithdrawalLimit} currency="NGN" className="font-normal" />
        ),
        exportValue: (p) => p.dailyWithdrawalLimit,
      },
      {
        id: "updatedAt",
        header: "Last updated",
        cell: (p) => <DateTime value={p.updatedAt} />,
        exportValue: (p) => p.updatedAt,
      },
    ],
    [],
  );
  const preferences = useTablePreferences("kyc-queue", columns);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="KYC status"
          className="flex rounded-md border bg-card p-0.5"
        >
          {KYC_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => {
                void setFilter(value);
                table.setPage(1);
              }}
              className={cn(
                "h-7 rounded-sm px-2.5 text-sm transition-colors",
                filter === value
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {FILTER_LABELS[value]}
            </button>
          ))}
        </div>
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search customer…"
        />
        <div className="ml-auto flex items-center gap-2">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
          <ColumnCustomizer preferences={preferences} />
          <ExportDialog
            dataset="kyc-profiles"
            columns={preferences.orderedColumns}
            visibleColumnIds={preferences.visibleColumns.map((c) => c.id)}
            source={{
              pageRows,
              selectedRows: [],
              totalMatching: total,
              maxRows: EXPORT_MAX_ROWS,
              loadAll: async (signal, onProgress) => {
                const all: KycProfile[] = [];
                for (let page = 1; all.length < total; page++) {
                  const chunk = await fetchKycQueue(
                    { ...query, page, pageSize: EXPORT_PAGE_SIZE },
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
        label="KYC profiles"
        subject="the KYC queue"
        columns={preferences.visibleColumns}
        rows={pageRows}
        getRowId={(p) => p.id}
        density={preferences.density}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={open?.id}
        empty={
          filter === "pending"
            ? {
                icon: ScanFaceIcon,
                title: "Nothing awaiting review",
                description:
                  "New address and ID submissions appear here. Level 1 is verified automatically.",
              }
            : {
                icon: ScanFaceIcon,
                title: "No profiles",
                description: "No KYC profiles match this view.",
              }
        }
      />
      <Pagination
        page={table.page}
        pageSize={table.pageSize}
        total={total}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />

      <Sheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        {open && (
          <SheetContent className="sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>{customerName(open)}</SheetTitle>
              <SheetDescription>{open.user?.email}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <KycSummary
                // Keep the drawer in sync after a decision refetches the queue.
                profile={pageRows.find((p) => p.id === open.id) ?? open}
                customerName={customerName(open)}
              />
            </SheetBody>
            {canViewUsers && (
              <SheetFooter>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/users/${open.userId}`}>
                    <ExternalLinkIcon aria-hidden />
                    Open customer
                  </Link>
                </Button>
              </SheetFooter>
            )}
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
