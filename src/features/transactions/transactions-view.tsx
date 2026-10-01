"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRightIcon, ExternalLinkIcon, FilterXIcon } from "lucide-react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo, useState } from "react";

import { ColumnCustomizer } from "@/components/data-table/column-customizer";
import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import { useTablePreferences } from "@/components/data-table/use-table-preferences";
import { useTableUrlState } from "@/components/data-table/use-table-url-state";
import { ExportDialog, type ExportSource } from "@/components/export/export-dialog";
import { DATE_PRESETS, resolveDateRange } from "@/components/filters/date-range";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { Freshness } from "@/components/states/freshness";
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
import { useHasPermission } from "@/features/auth/admin-context";

import {
  CURRENCY_TYPES,
  fetchTransactions,
  type Transaction,
  TRANSACTION_SORT_KEYS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type TransactionQuery,
} from "./api";
import { transactionColumns } from "./columns";
import { TRANSACTION_STATUS, TRANSACTION_TYPE } from "./labels";
import { TransactionDetails } from "./transaction-details";

const DEFAULT_SORT = { key: "createdAt", direction: "desc" } as const;

/** `GET /transactions/admin/all` caps `limit` at 200. */
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 10_000;

const filterParsers = {
  status: parseAsStringLiteral(TRANSACTION_STATUSES),
  type: parseAsStringLiteral(TRANSACTION_TYPES),
  currency: parseAsStringLiteral(CURRENCY_TYPES),
  user: parseAsString,
  range: parseAsStringLiteral([...DATE_PRESETS, "custom"] as const),
  from: parseAsString,
  to: parseAsString,
};

interface TransactionsViewProps {
  /** Fixes the list to one customer (user detail page); hides the customer filter. */
  userId?: string;
  /** Distinct table id so preferences for embedded tables are stored separately. */
  tableId?: string;
}

export function TransactionsView({ userId, tableId = "transactions" }: TransactionsViewProps) {
  const canViewUsers = useHasPermission("users.view");
  const table = useTableUrlState({ sortKeys: TRANSACTION_SORT_KEYS, defaultSort: DEFAULT_SORT });
  const [filters, setFilters] = useQueryStates(filterParsers, { clearOnDefault: true });
  const columns = useMemo(() => transactionColumns({ canViewUsers }), [canViewUsers]);
  const preferences = useTablePreferences(tableId, columns);
  const [selected, setSelected] = useState<Map<string, Transaction>>(new Map());
  const [openTx, setOpenTx] = useState<Transaction | null>(null);

  const range = resolveDateRange({ range: filters.range, from: filters.from, to: filters.to });
  const query: Omit<TransactionQuery, "page" | "pageSize"> = {
    search: table.search,
    status: filters.status,
    type: filters.type,
    currencyType: filters.currency,
    userId: userId ?? filters.user,
    from: range?.from.toISOString() ?? null,
    to: range?.to.toISOString() ?? null,
    sortBy: (table.sort?.key ?? "createdAt") as TransactionQuery["sortBy"],
    sortOrder: table.sort?.direction ?? "desc",
  };

  // Presets such as "Today" resolve against now; key on the preset, not the moving instant.
  const rangeKey = filters.range === "custom" ? `${filters.from}..${filters.to}` : filters.range;
  const result = useQuery({
    queryKey: [
      "transactions",
      {
        ...query,
        from: undefined,
        to: undefined,
        rangeKey,
        page: table.page,
        pageSize: table.pageSize,
      },
    ],
    queryFn: ({ signal }) =>
      fetchTransactions({ ...query, page: table.page, pageSize: table.pageSize }, signal),
    placeholderData: keepPreviousData,
  });

  const rows = result.data?.rows ?? [];
  const total = result.data?.total ?? 0;
  const activeFilterCount = [
    filters.status,
    filters.type,
    filters.currency,
    filters.range,
    !userId && filters.user,
    table.search,
  ].filter(Boolean).length;

  const exportSource: ExportSource<Transaction> = {
    pageRows: rows,
    selectedRows: [...selected.values()],
    totalMatching: total,
    maxRows: EXPORT_MAX_ROWS,
    loadAll: async (signal, onProgress) => {
      const all: Transaction[] = [];
      for (let page = 1; all.length < total; page++) {
        const chunk = await fetchTransactions(
          { ...query, page, pageSize: EXPORT_PAGE_SIZE },
          signal,
        );
        all.push(...chunk.rows);
        onProgress(all.length);
        if (chunk.rows.length < EXPORT_PAGE_SIZE) break;
      }
      return all;
    },
  };

  function clearFilters() {
    void setFilters({
      status: null,
      type: null,
      currency: null,
      user: null,
      range: null,
      from: null,
      to: null,
    });
    table.setSearch("");
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search reference, email, phone…"
          description="Matches reference, provider reference, description, customer email, username and phone. Case-sensitive."
        />
        <SelectFilter
          label="Status"
          value={filters.status}
          options={TRANSACTION_STATUSES.map((value) => ({
            value,
            label: TRANSACTION_STATUS[value].label,
          }))}
          onChange={(status) => void setFilters({ status })}
        />
        <SelectFilter
          label="Type"
          value={filters.type}
          options={TRANSACTION_TYPES.map((value) => ({
            value,
            label: TRANSACTION_TYPE[value].label,
          }))}
          onChange={(type) => void setFilters({ type })}
        />
        <SelectFilter
          label="Currency"
          value={filters.currency}
          options={[
            { value: "FIAT", label: "Fiat (naira)" },
            { value: "CRYPTO", label: "Crypto" },
          ]}
          onChange={(currency) => void setFilters({ currency })}
        />
        <DateRangeFilter
          value={{ range: filters.range, from: filters.from, to: filters.to }}
          onChange={(value) => void setFilters(value)}
        />
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterXIcon aria-hidden />
            Clear filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
          <ColumnCustomizer preferences={preferences} />
          <ExportDialog
            dataset="transactions"
            columns={preferences.orderedColumns}
            visibleColumnIds={preferences.visibleColumns.map((c) => c.id)}
            source={exportSource}
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 rounded-md border bg-accent/40 px-3 py-1.5 text-sm"
          role="status"
        >
          <span>{selected.size} selected</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => {
              setSelected(new Map());
            }}
          >
            Clear selection
          </Button>
          <span className="text-xs text-muted-foreground">
            Use Export to download the selected rows.
          </span>
        </div>
      )}

      <DataTable
        label="Transactions"
        subject="transactions"
        columns={preferences.visibleColumns}
        rows={rows}
        getRowId={(tx) => tx.id}
        density={preferences.density}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        sort={table.sort}
        onSortChange={table.setSort}
        selection={{
          selected: new Set(selected.keys()),
          onChange: (ids) => {
            setSelected((current) => {
              const next = new Map<string, Transaction>();
              for (const id of ids) {
                const row = current.get(id) ?? rows.find((tx) => tx.id === id);
                if (row) next.set(id, row);
              }
              return next;
            });
          },
        }}
        onRowActivate={setOpenTx}
        activeRowId={openTx?.id}
        empty={
          activeFilterCount > 0
            ? {
                icon: FilterXIcon,
                title: "No transactions match these filters",
                description:
                  "Try a wider date range or clear some filters. Search is case-sensitive.",
                action: (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ),
              }
            : {
                icon: ArrowLeftRightIcon,
                title: "No transactions yet",
                description:
                  "Trades, transfers, deposits and bill payments appear here as customers make them.",
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
        open={openTx !== null}
        onOpenChange={(open) => {
          if (!open) setOpenTx(null);
        }}
      >
        {openTx && (
          <SheetContent className="sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Transaction</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {openTx.reference ?? openTx.id}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <TransactionDetails tx={openTx} canViewUsers={canViewUsers} />
            </SheetBody>
            {openTx.reference && (
              <SheetFooter>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/transactions/${encodeURIComponent(openTx.reference)}`}>
                    <ExternalLinkIcon aria-hidden />
                    Open full page
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
