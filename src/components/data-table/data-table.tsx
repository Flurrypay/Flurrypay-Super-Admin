"use client";

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, InfoIcon } from "lucide-react";
import type { KeyboardEvent } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { DataColumn, Density, EmptyStateConfig, SortState } from "./types";

interface Selection {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

interface DataTableProps<T> {
  /** Accessible name for the table. */
  label: string;
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  density?: Density;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Subject for the error message, e.g. "transactions". */
  subject: string;
  empty: EmptyStateConfig;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  selection?: Selection;
  /** Opens a row, e.g. a quick-view drawer. Rows become keyboard-focusable. */
  onRowActivate?: (row: T) => void;
  /** Visually marks the row whose drawer is open. */
  activeRowId?: string | null;
  skeletonRows?: number;
}

const SORT_CYCLE: Record<"none" | "asc" | "desc", SortState["direction"] | null> = {
  none: "desc",
  desc: "asc",
  asc: null,
};

export function DataTable<T>({
  label,
  columns,
  rows,
  getRowId,
  density = "compact",
  isLoading = false,
  error,
  onRetry,
  subject,
  empty,
  sort,
  onSortChange,
  selection,
  onRowActivate,
  activeRowId,
  skeletonRows = 8,
}: DataTableProps<T>) {
  const cellPadding = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const pageIds = rows.map(getRowId);
  const selectedOnPage = selection ? pageIds.filter((id) => selection.selected.has(id)).length : 0;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  function togglePage(checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of pageIds) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    selection.onChange(next);
  }

  function toggleRow(id: string, checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (checked) next.add(id);
    else next.delete(id);
    selection.onChange(next);
  }

  function handleSort(column: DataColumn<T>) {
    if (!column.sortKey || !onSortChange) return;
    const current = sort && sort.key === column.sortKey ? sort.direction : "none";
    const next = SORT_CYCLE[current];
    onSortChange(next ? { key: column.sortKey, direction: next } : null);
  }

  function handleRowKey(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowActivate?.(row);
    }
  }

  const responsive = (column: DataColumn<T>) =>
    column.priority === "secondary"
      ? "hidden md:table-cell"
      : column.priority === "tertiary"
        ? "hidden xl:table-cell"
        : undefined;

  const colSpan = columns.length + (selection ? 1 : 0);
  const showSkeleton = isLoading && rows.length === 0;

  return (
    <div className="relative max-h-[calc(100dvh-15rem)] min-h-40 overflow-auto rounded-md border bg-card">
      <table
        className="w-full border-separate border-spacing-0 text-sm"
        aria-label={label}
        aria-busy={isLoading}
      >
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-[2px]">
          <tr>
            {selection && (
              <th scope="col" className="w-9 border-b px-3 py-2 text-left">
                <Checkbox
                  aria-label="Select all rows on this page"
                  checked={allOnPageSelected ? true : selectedOnPage > 0 ? "indeterminate" : false}
                  onCheckedChange={(value) => {
                    togglePage(value === true);
                  }}
                  disabled={rows.length === 0}
                />
              </th>
            )}
            {columns.map((column) => {
              const sortable = Boolean(column.sortKey && onSortChange);
              const direction = sort && sort.key === column.sortKey ? sort.direction : null;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    direction === "asc"
                      ? "ascending"
                      : direction === "desc"
                        ? "descending"
                        : undefined
                  }
                  className={cn(
                    "border-b px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground",
                    column.align === "right" ? "text-right" : "text-left",
                    responsive(column),
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      column.align === "right" && "flex-row-reverse",
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => {
                          handleSort(column);
                        }}
                        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-foreground"
                      >
                        {column.header}
                        {direction === "asc" ? (
                          <ArrowUpIcon className="size-3" aria-hidden />
                        ) : direction === "desc" ? (
                          <ArrowDownIcon className="size-3" aria-hidden />
                        ) : (
                          <ArrowUpDownIcon className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                    {column.description && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-sm text-muted-foreground/70 hover:text-foreground"
                          >
                            <InfoIcon className="size-3" aria-hidden />
                            <span className="sr-only">About {column.header}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{column.description}</TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {showSkeleton &&
            Array.from({ length: skeletonRows }, (_, index) => (
              <tr key={index}>
                {selection && <td className={cn("border-b", cellPadding)} />}
                {columns.map((column) => (
                  <td key={column.id} className={cn("border-b", cellPadding, responsive(column))}>
                    <Skeleton className="h-4 w-full max-w-32" />
                  </td>
                ))}
              </tr>
            ))}

          {!showSkeleton && error != null && rows.length === 0 && (
            <tr>
              <td colSpan={colSpan}>
                <ErrorState error={error} subject={subject} onRetry={onRetry} />
              </td>
            </tr>
          )}

          {!showSkeleton && error == null && rows.length === 0 && (
            <tr>
              <td colSpan={colSpan}>
                <EmptyState {...empty} />
              </td>
            </tr>
          )}

          {rows.map((row) => {
            const id = getRowId(row);
            const selected = selection?.selected.has(id) ?? false;
            return (
              <tr
                key={id}
                data-state={selected ? "selected" : undefined}
                data-active={activeRowId === id ? "" : undefined}
                tabIndex={onRowActivate ? 0 : undefined}
                onClick={
                  onRowActivate
                    ? (event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest("a,button,input,[role=checkbox]")) return;
                        onRowActivate(row);
                      }
                    : undefined
                }
                onKeyDown={
                  onRowActivate
                    ? (event) => {
                        handleRowKey(event, row);
                      }
                    : undefined
                }
                className={cn(
                  "transition-colors data-[active]:bg-accent/60 data-[state=selected]:bg-accent/40",
                  onRowActivate &&
                    "cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                  isLoading && "opacity-60",
                )}
              >
                {selection && (
                  <td className={cn("border-b", cellPadding)}>
                    <Checkbox
                      aria-label={`Select row ${id}`}
                      checked={selected}
                      onCheckedChange={(value) => {
                        toggleRow(id, value === true);
                      }}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      "border-b align-middle",
                      cellPadding,
                      column.align === "right" && "text-right",
                      responsive(column),
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
