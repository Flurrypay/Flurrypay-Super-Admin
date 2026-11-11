"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRightIcon,
  ExternalLinkIcon,
  FilterXIcon,
  FlagIcon,
  FlagOffIcon,
} from "lucide-react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ColumnCustomizer } from "@/components/data-table/column-customizer";
import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { useTablePreferences } from "@/components/data-table/use-table-preferences";
import { useTableUrlState } from "@/components/data-table/use-table-url-state";
import { ExportDialog, type ExportSource } from "@/components/export/export-dialog";
import { DATE_PRESETS, resolveDateRange } from "@/components/filters/date-range";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { Freshness } from "@/components/states/freshness";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHasPermission, useIsSuperAdmin } from "@/features/auth/admin-context";
import { adminApi } from "@/lib/api/admin-client";
import { adminPaths } from "@/lib/api/admin-paths";

import {
  CURRENCY_TYPES,
  fetchFlagSummary,
  fetchTransactions,
  FLAG_SEVERITIES,
  FLAG_VIEWS,
  isFlagged,
  type Transaction,
  TRANSACTION_SORT_KEYS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type TransactionQuery,
} from "./api";
import { transactionColumns } from "./columns";
import { ClearFlagDialog, FlagTransactionDialog } from "./flag-dialogs";
import { FLAG_SEVERITY_LABEL, TRANSACTION_STATUS, TRANSACTION_TYPE } from "./labels";
import { TransactionDetails } from "./transaction-details";

const DEFAULT_SORT = { key: "createdAt", direction: "desc" } as const;
/** GET /transactions/admin/all supports a maximum limit of 200. */
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 10_000;

type ResolveAction = "retry" | "resolve" | "refund";

type AssetType = "FIAT" | "CRYPTO";

const filterParsers = {
  status: parseAsStringLiteral(TRANSACTION_STATUSES),
  type: parseAsStringLiteral(TRANSACTION_TYPES),
  currency: parseAsStringLiteral(CURRENCY_TYPES),
  user: parseAsString,
  range: parseAsStringLiteral([...DATE_PRESETS, "custom"] as const),
  from: parseAsString,
  to: parseAsString,
  flagged: parseAsStringLiteral(FLAG_VIEWS),
  flagSeverity: parseAsStringLiteral(FLAG_SEVERITIES),
};

interface TransactionsViewProps {
  /** Fixes the list to one customer and hides the customer filter. */
  userId?: string;
  /** Uses a separate preference namespace for embedded tables. */
  tableId?: string;
}

export function TransactionsView({ userId, tableId = "transactions" }: TransactionsViewProps) {
  const canViewUsers = useHasPermission("users.view");
  const canFlag = useHasPermission("compliance.review");
  const queryClient = useQueryClient();

  const canSuperAdmin = useIsSuperAdmin();
  const canMutateWallet = canSuperAdmin && Boolean(userId);

  const [openDebit, setOpenDebit] = useState(false);
  const [openCredit, setOpenCredit] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetType>("FIAT");
  const [amount, setAmount] = useState<string>("");

  // Debit mutation
  const debitMutation = useMutation({
    mutationFn: async ({
      userId,
      amount,
      asset,
    }: {
      userId: string;
      amount: string;
      asset: AssetType;
    }) => {
      return adminApi.post(`${adminPaths.users}/${encodeURIComponent(userId)}/debit`, {
        amount: Number(amount),
        asset,
      });
    },
    onSuccess: async () => {
      toast.success("Wallet debited successfully");
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setOpenDebit(false);
      setAmount("");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to debit wallet";
      toast.error(message);
    },
  });

  // Credit mutation
  const creditMutation = useMutation({
    mutationFn: async ({
      userId,
      amount,
      asset,
    }: {
      userId: string;
      amount: string;
      asset: AssetType;
    }) => {
      return adminApi.post(`${adminPaths.users}/${encodeURIComponent(userId)}/credit`, {
        amount: Number(amount),
        asset,
      });
    },
    onSuccess: async () => {
      toast.success("Wallet credited successfully");
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setOpenCredit(false);
      setAmount("");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to credit wallet";
      toast.error(message);
    },
  });

  const table = useTableUrlState({ sortKeys: TRANSACTION_SORT_KEYS, defaultSort: DEFAULT_SORT });
  const [filters, setFilters] = useQueryStates(filterParsers, { clearOnDefault: true });

  const [selected, setSelected] = useState<Map<string, Transaction>>(new Map());
  const [openTx, setOpenTx] = useState<Transaction | null>(null);
  const [flagDialog, setFlagDialog] = useState<"raise" | "clear" | null>(null);
  const [resolveTx, setResolveTx] = useState<Transaction | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);

  const openResolveDialog = useCallback((tx: Transaction) => {
    setResolveTx(tx);
    setResolveOpen(true);
  }, []);
  const closeResolveDialog = useCallback(() => {
    setResolveOpen(false);
    setResolveTx(null);
  }, []);

  const range = resolveDateRange({ range: filters.range, from: filters.from, to: filters.to });
  const query: Omit<TransactionQuery, "page" | "pageSize"> = {
    search: table.search,
    status: filters.status,
    type: filters.type,
    currencyType: filters.currency,
    userId: userId ?? filters.user,
    from: range?.from.toISOString() ?? null,
    to: range?.to.toISOString() ?? null,
    flagged: filters.flagged,
    flagSeverity: filters.flagSeverity,
    sortBy: (table.sort?.key ?? "createdAt") as TransactionQuery["sortBy"],
    sortOrder: table.sort?.direction ?? "desc",
  };

  const rangeKey =
    filters.range === "custom" ? `${filters.from ?? ""}..${filters.to ?? ""}` : filters.range;

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
  const openRow = openTx ? (rows.find((row) => row.id === openTx.id) ?? openTx) : null;

  const flagSummary = useQuery({
    queryKey: ["transaction-flags"],
    queryFn: ({ signal }) => fetchFlagSummary(signal),
    enabled: canFlag,
    refetchInterval: 120_000,
  });

  const openFlags = flagSummary.data?.total ?? 0;

  const providerStatusQuery = useQuery({
    queryKey: ["provider-status", resolveTx?.id],
    queryFn: () => {
      if (!resolveTx?.id) return Promise.resolve(null);
      return adminApi.get(
        `${adminPaths.transactions}/${encodeURIComponent(resolveTx.id)}/provider-status`,
      );
    },
    enabled: resolveOpen && Boolean(resolveTx?.id),
    retry: 1,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: ResolveAction }) => {
      return adminApi.post(`${adminPaths.transactions}/${encodeURIComponent(id)}/${action}`);
    },
    onSuccess: async () => {
      toast.success("Transaction action completed successfully.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["transaction-flags"] }),
        queryClient.invalidateQueries({ queryKey: ["provider-status", resolveTx?.id] }),
      ]);
      closeResolveDialog();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Unable to process the transaction action.";
      toast.error(message);
    },
  });

  const columns = useMemo((): DataColumn<Transaction>[] => {
    const baseColumns = transactionColumns({ canViewUsers });
    const actionColumn: DataColumn<Transaction> = {
      id: "actions",
      header: "",
      cell: (tx: Transaction) => {
        if (tx.status !== "FAILED") return null;
        return (
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                openResolveDialog(tx);
              }}
            >
              Resolve
            </Button>
          </div>
        );
      },
      required: true,
    };
    return [...baseColumns, actionColumn];
  }, [canViewUsers, openResolveDialog]);

  const preferences = useTablePreferences(tableId, columns);

  const activeFilterCount = [
    filters.status,
    filters.type,
    filters.currency,
    filters.range,
    filters.flagged,
    filters.flagSeverity,
    !userId && filters.user,
    table.search,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    void setFilters({
      status: null,
      type: null,
      currency: null,
      user: null,
      range: null,
      from: null,
      to: null,
      flagged: null,
      flagSeverity: null,
    });
    table.setSearch("");
  }, [setFilters, table]);

  const exportSource: ExportSource<Transaction> = {
    pageRows: rows,
    selectedRows: Array.from(selected.values()),
    totalMatching: total,
    maxRows: EXPORT_MAX_ROWS,
    loadAll: async (signal, onProgress) => {
      const all: Transaction[] = [];
      const targetRows = Math.min(total, EXPORT_MAX_ROWS);
      let page = 1;
      while (all.length < targetRows) {
        if (signal.aborted) throw new DOMException("Export was cancelled.", "AbortError");
        const remaining = targetRows - all.length;
        const chunk = await fetchTransactions(
          { ...query, page, pageSize: Math.min(EXPORT_PAGE_SIZE, remaining) },
          signal,
        );
        if (chunk.rows.length === 0) break;
        all.push(...chunk.rows);
        onProgress(all.length);
        if (chunk.rows.length < Math.min(EXPORT_PAGE_SIZE, remaining)) break;
        page += 1;
      }
      return all;
    },
  };

  return (
    <div className="grid gap-3">
      {/* Filters and toolbar */}
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
        {canFlag && (
          <>
            <SelectFilter
              label="Flag"
              value={filters.flagged}
              options={[
                {
                  value: "FLAGGED",
                  label: openFlags > 0 ? `Open flags (${openFlags})` : "Open flags",
                },
                { value: "CLEARED", label: "Already cleared" },
              ]}
              onChange={(flagged) =>
                void setFilters(flagged ? { flagged } : { flagged: null, flagSeverity: null })
              }
            />
            {filters.flagged === "FLAGGED" && (
              <SelectFilter
                label="Severity"
                value={filters.flagSeverity}
                options={FLAG_SEVERITIES.map((value) => ({
                  value,
                  label: `${FLAG_SEVERITY_LABEL[value]} (${flagSummary.data?.bySeverity[value] ?? 0})`,
                }))}
                onChange={(flagSeverity) => void setFilters({ flagSeverity })}
              />
            )}
          </>
        )}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterXIcon aria-hidden /> Clear filters
          </Button>
        )}
        {/* Right-side toolbar */}
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
          {canMutateWallet && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpenDebit(true);
                }}
              >
                Debit Wallet
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpenCredit(true);
                }}
              >
                Credit Wallet
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Selected rows information */}
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

      {/* Transactions table */}
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
        activeRowId={openRow?.id}
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

      {/* Pagination */}
      <Pagination
        page={table.page}
        pageSize={table.pageSize}
        total={total}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />

      {/* Transaction details sheet */}
      <Sheet
        open={openRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenTx(null);
            setFlagDialog(null);
          }
        }}
      >
        {openRow && (
          <SheetContent className="sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Transaction</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {openRow.reference ?? openRow.id}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <TransactionDetails tx={openRow} canViewUsers={canViewUsers} />
            </SheetBody>
            {(openRow.reference || canFlag) && (
              <SheetFooter className="flex-wrap gap-2">
                {canFlag &&
                  (isFlagged(openRow) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFlagDialog("clear");
                      }}
                    >
                      {" "}
                      <FlagOffIcon aria-hidden /> Clear flag{" "}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFlagDialog("raise");
                      }}
                    >
                      {" "}
                      <FlagIcon aria-hidden /> Flag for review{" "}
                    </Button>
                  ))}
                {openRow.reference && (
                  <Link
                    href={`/transactions/${encodeURIComponent(openRow.reference)}`}
                    className="inline-block"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLinkIcon aria-hidden /> Open full page
                    </Button>
                  </Link>
                )}
              </SheetFooter>
            )}
          </SheetContent>
        )}
      </Sheet>

      {/* Resolve failed transaction sheet */}
      <Sheet
        open={resolveOpen}
        onOpenChange={(open) => {
          if (!open && !resolveMutation.isPending) closeResolveDialog();
        }}
      >
        {resolveTx && (
          <SheetContent className="sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Resolve Transaction</SheetTitle>
              <SheetDescription>
                Resolve failed transaction <span className="font-mono">{resolveTx.id}</span>
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <div className="grid gap-3">
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Provider status</p>
                  {providerStatusQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Checking provider status...</p>
                  ) : providerStatusQuery.isError ? (
                    <div className="grid gap-2">
                      <p className="text-sm text-destructive">
                        Unable to retrieve provider status.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        onClick={() => void providerStatusQuery.refetch()}
                      >
                        Retry status check
                      </Button>
                    </div>
                  ) : providerStatusQuery.data ? (
                    <pre className="max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
                      {JSON.stringify(providerStatusQuery.data, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">No provider status available.</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Only perform an action after verifying the transaction and its provider-side
                  status.
                </p>
              </div>
            </SheetBody>
            <SheetFooter className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={resolveMutation.isPending}
                onClick={closeResolveDialog}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={resolveMutation.isPending || providerStatusQuery.isLoading}
                loading={resolveMutation.isPending && resolveMutation.variables.action === "retry"}
                onClick={() => {
                  resolveMutation.mutate({ id: resolveTx.id, action: "retry" });
                }}
              >
                Retry
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={resolveMutation.isPending}
                loading={
                  resolveMutation.isPending && resolveMutation.variables.action === "resolve"
                }
                onClick={() => {
                  resolveMutation.mutate({ id: resolveTx.id, action: "resolve" });
                }}
              >
                Mark Resolved
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={resolveMutation.isPending}
                loading={resolveMutation.isPending && resolveMutation.variables.action === "refund"}
                onClick={() => {
                  resolveMutation.mutate({ id: resolveTx.id, action: "refund" });
                }}
              >
                Refund
              </Button>
            </SheetFooter>
          </SheetContent>
        )}
      </Sheet>

      {/* Debit wallet sheet */}
      <Sheet
        open={openDebit}
        onOpenChange={(next) => {
          setOpenDebit(next);
          if (!next) setAmount("");
        }}
      >
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Debit Wallet</SheetTitle>
            <SheetDescription>Select asset type and amount to debit.</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            <Select
              value={selectedAsset}
              onValueChange={(value) => {
                setSelectedAsset(value as AssetType);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIAT">FIAT</SelectItem>
                <SelectItem value="CRYPTO">CRYPTO</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              placeholder="Amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
            />
          </SheetBody>
          <SheetFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpenDebit(false);
                setAmount("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!amount || isNaN(Number(amount)) || !userId}
              loading={debitMutation.isPending}
              onClick={() => {
                if (!userId) return;
                debitMutation.mutate({ userId, amount, asset: selectedAsset });
              }}
            >
              Debit
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Credit wallet sheet */}
      <Sheet
        open={openCredit}
        onOpenChange={(next) => {
          setOpenCredit(next);
          if (!next) setAmount("");
        }}
      >
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Credit Wallet</SheetTitle>
            <SheetDescription>Select asset type and amount to credit.</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            <Select
              value={selectedAsset}
              onValueChange={(value) => {
                setSelectedAsset(value as AssetType);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIAT">FIAT</SelectItem>
                <SelectItem value="CRYPTO">CRYPTO</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              placeholder="Amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
            />
          </SheetBody>
          <SheetFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpenCredit(false);
                setAmount("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!amount || isNaN(Number(amount)) || !userId}
              loading={creditMutation.isPending}
              onClick={() => {
                if (!userId) return;
                creditMutation.mutate({ userId, amount, asset: selectedAsset });
              }}
            >
              Credit
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Flag transaction dialogs */}
      {openRow && canFlag && (
        <>
          <FlagTransactionDialog
            key={`flag-${openRow.id}`}
            tx={openRow}
            open={flagDialog === "raise"}
            onOpenChange={(next) => {
              if (!next) setFlagDialog(null);
            }}
          />
          <ClearFlagDialog
            key={`clear-${openRow.id}`}
            tx={openRow}
            open={flagDialog === "clear"}
            onOpenChange={(next) => {
              if (!next) setFlagDialog(null);
            }}
          />
        </>
      )}
    </div>
  );
}
