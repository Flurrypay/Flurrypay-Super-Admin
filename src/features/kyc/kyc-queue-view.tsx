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

import { fetchKycQueue, fetchUserKyc, KYC_FILTERS, type KycFilter, type KycProfile } from "./api";
import { KycSummary } from "./kyc-summary";
import { KycWorkflowOverview } from "./kyc-workflow-overview";
import { KYC_STATUS } from "./labels";

const FILTER_LABELS: Record<KycFilter, string> = {
  ready: "Ready for review",
  action_required: "Needs customer action",
  legacy: "Legacy submissions",
  pending: "Level 3 submissions",
  verified: "Verified records",
  rejected: "Rejected",
  all: "All",
};

function customerName(profile: KycProfile): string {
  if (!profile.user) return "Unknown customer";
  return `${profile.user.firstName} ${profile.user.lastName}`.trim() || profile.user.email;
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
            "inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-xs",
            info.tone === "success" && "border-success/25 bg-success/8 text-success",
            info.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
            info.tone === "danger" && "border-destructive/25 bg-destructive/8 text-destructive",
            info.tone === "neutral" && "text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span>{info.label}</span>
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
    parseAsStringLiteral(KYC_FILTERS).withDefault("ready"),
  );
  const table = useTableUrlState({ sortKeys: SORT_KEYS });
  const [open, setOpen] = useState<KycProfile | null>(null);

  const query = { filter, search: table.search, page: table.page, pageSize: table.pageSize };
  const result = useQuery({
    queryKey: ["kyc-queue", query],
    queryFn: ({ signal }) => fetchKycQueue(query, signal),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  const openProfile = useQuery({
    queryKey: ["user-kyc", open?.userId],
    queryFn: ({ signal }) => fetchUserKyc(open?.userId ?? "", signal),
    enabled: open !== null,
    refetchInterval: 30_000,
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
        id: "readiness",
        header: "Next action",
        required: true,
        cell: (p) => (
          <span className="grid max-w-64 gap-1">
            <Badge
              tone={
                p.review?.category === "READY"
                  ? "success"
                  : p.review?.category === "COMPLETED"
                    ? "neutral"
                    : "warning"
              }
            >
              {p.review?.category === "READY"
                ? "Review address"
                : p.review?.category === "LEGACY"
                  ? "Legacy follow-up"
                  : p.review?.category === "COMPLETED"
                    ? "Completed"
                    : "Customer action"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {p.review?.missingSteps[0] ||
                (p.level3.canApprove
                  ? "All required evidence complete"
                  : "Open profile for verification details")}
            </span>
          </span>
        ),
        exportValue: (p) => [p.review?.category, ...(p.review?.missingSteps || [])].join(" · "),
      },
      {
        id: "bvn",
        header: "BVN · Automatic",
        cell: (p) => (
          <LevelStatus status={p.level1.providerVerified ? p.level1.status : "NOT_STARTED"} />
        ),
        exportValue: (p) => (p.level1.providerVerified ? "VERIFIED" : "REQUIRED"),
      },
      {
        id: "nin",
        header: "NIN · Automatic",
        cell: (p) => (
          <LevelStatus status={p.level2.identityMatched ? p.level2.status : "NOT_STARTED"} />
        ),
        exportValue: (p) => (p.level2.identityMatched ? "VERIFIED" : "REQUIRED"),
      },
      {
        id: "level3",
        header: "Level 3 · Review",
        cell: (p) => <LevelStatus status={p.level3.status} />,
        exportValue: (p) => p.level3.status,
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
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <KycWorkflowOverview
        summary={result.data?.summary}
        filter={filter}
        error={result.isError}
        onSelect={(value) => {
          void setFilter(value);
          table.setPage(1);
        }}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Verification queue filters"
          className="flex max-w-full min-w-0 gap-0.5 overflow-x-auto rounded-lg border bg-card p-1"
        >
          {KYC_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                void setFilter(value);
                table.setPage(1);
              }}
              className={cn(
                "h-8 shrink-0 rounded-md px-2.5 text-xs transition-colors",
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
        isLoading={result.isPending}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={setOpen}
        activeRowId={open?.id}
        empty={
          filter === "ready" || filter === "pending"
            ? {
                icon: ScanFaceIcon,
                title:
                  filter === "ready"
                    ? "No complete submissions awaiting review"
                    : "No Level 3 submissions",
                description:
                  "Use Needs customer action or Legacy submissions to follow up on incomplete records.",
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
                profile={
                  openProfile.data?.profile ?? pageRows.find((p) => p.id === open.id) ?? open
                }
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
