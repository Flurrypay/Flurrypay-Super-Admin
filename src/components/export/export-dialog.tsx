"use client";

import { DownloadIcon, InfoIcon, LoaderCircleIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { DataColumn } from "@/components/data-table/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getUserMessage, isAbortError } from "@/lib/api/errors";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

import { downloadCsv, exportFileName, toCsv } from "./csv";

type Scope = "page" | "selected" | "all";

export interface ExportSource<T> {
  /** Rows currently displayed. */
  pageRows: readonly T[];
  /** Rows the viewer has selected (possibly across pages). */
  selectedRows: readonly T[];
  /** Number of rows matching the current filters. */
  totalMatching: number;
  /**
   * Loads every matching row by walking the list endpoint's pages. Omit on lists
   * with no pagination, which then export only the current page or the selection.
   */
  loadAll?: (signal: AbortSignal, onProgress: (loaded: number) => void) => Promise<readonly T[]>;
  /** Row limit for browser-generated "all" exports. */
  maxRows: number;
}

interface ExportDialogProps<T> {
  /** Dataset name used in the title and file name, e.g. "transactions". */
  dataset: string;
  columns: readonly DataColumn<T>[];
  /** Column ids visible in the table; preselected in the column picker. */
  visibleColumnIds: readonly string[];
  source: ExportSource<T>;
}

export function ExportDialog<T>({
  dataset,
  columns,
  visibleColumnIds,
  source,
}: ExportDialogProps<T>) {
  const exportable = useMemo(() => columns.filter((c) => c.exportValue), [columns]);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("page");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  const allTooLarge = source.totalMatching > source.maxRows;
  const canExportAll = Boolean(source.loadAll) && !allTooLarge && source.totalMatching > 0;

  const scopes: { id: Scope; label: string; count: number; disabled: boolean; hint?: string }[] = [
    {
      id: "page",
      label: "Current page",
      count: source.pageRows.length,
      disabled: source.pageRows.length === 0,
    },
    {
      id: "selected",
      label: "Selected rows",
      count: source.selectedRows.length,
      disabled: source.selectedRows.length === 0,
    },
    {
      id: "all",
      label: "All filtered results",
      count: source.totalMatching,
      disabled: !canExportAll,
      hint: allTooLarge
        ? `Over ${formatCount(source.maxRows)} rows. Narrow the filters to export.`
        : undefined,
    },
  ];

  function handleOpenChange(next: boolean) {
    if (!next) controller?.abort();
    if (next) {
      setChosen(new Set(visibleColumnIds.filter((id) => exportable.some((c) => c.id === id))));
      setScope(source.selectedRows.length > 0 ? "selected" : "page");
      setProgress(null);
    }
    setOpen(next);
  }

  async function run() {
    const selectedColumns = exportable.filter((c) => chosen.has(c.id));
    const abort = new AbortController();
    setController(abort);
    try {
      let rows: readonly T[];
      if (scope === "page") rows = source.pageRows;
      else if (scope === "selected") rows = source.selectedRows;
      else {
        setProgress(0);
        rows = (await source.loadAll?.(abort.signal, setProgress)) ?? [];
      }
      downloadCsv(toCsv(rows, selectedColumns), exportFileName(dataset));
      toast.success(`Exported ${formatCount(rows.length)} ${dataset}`);
      setOpen(false);
    } catch (error) {
      if (!isAbortError(error)) toast.error(getUserMessage(error));
    } finally {
      setProgress(null);
      setController(null);
    }
  }

  const running = progress !== null;
  const sensitiveChosen = exportable.some((c) => c.sensitive && chosen.has(c.id));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <DownloadIcon aria-hidden />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {dataset}</DialogTitle>
          <DialogDescription>Choose the rows and columns to download as CSV.</DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Rows</legend>
          {scopes.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50",
                option.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="export-scope"
                className="mt-0.5 accent-(--primary)"
                checked={scope === option.id}
                disabled={option.disabled || running}
                onChange={() => {
                  setScope(option.id);
                }}
              />
              <span className="flex-1">
                <span className="flex justify-between gap-2">
                  {option.label}
                  <span className="text-muted-foreground tabular-nums">
                    {formatCount(option.count)}
                  </span>
                </span>
                {option.hint && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
            Columns
            <span className="flex gap-2 text-xs font-normal">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setChosen(new Set(exportable.map((c) => c.id)));
                }}
              >
                All
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setChosen(new Set());
                }}
              >
                None
              </button>
            </span>
          </legend>
          <div className="grid max-h-48 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto">
            {exportable.map((column) => (
              <div key={column.id} className="flex items-center gap-2">
                <Checkbox
                  id={`export-${column.id}`}
                  checked={chosen.has(column.id)}
                  disabled={running}
                  onCheckedChange={(value) => {
                    setChosen((current) => {
                      const next = new Set(current);
                      if (value === true) next.add(column.id);
                      else next.delete(column.id);
                      return next;
                    });
                  }}
                />
                <Label htmlFor={`export-${column.id}`} className="font-normal">
                  {column.header}
                  {column.sensitive && <span className="text-xs text-warning">Sensitive</span>}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        {sensitiveChosen && (
          <Alert tone="warning">
            <InfoIcon aria-hidden />
            <AlertDescription>
              This file will contain personal data. Store it securely and delete it when no longer
              needed.
            </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Exports are generated in your browser from data already on screen, so they are not
          recorded in the audit log.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              handleOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={running || chosen.size === 0}>
            {running ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden />
            ) : (
              <DownloadIcon aria-hidden />
            )}
            {running
              ? `Preparing ${formatCount(progress)} of ${formatCount(source.totalMatching)}…`
              : "Download CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
