"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FilterXIcon, UsersIcon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";

import { ColumnCustomizer } from "@/components/data-table/column-customizer";
import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import { useTablePreferences } from "@/components/data-table/use-table-preferences";
import { useTableUrlState } from "@/components/data-table/use-table-url-state";
import { ExportDialog } from "@/components/export/export-dialog";
import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { Freshness } from "@/components/states/freshness";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/features/auth/admin-context";

import { ACCOUNT_STATE, ACCOUNT_STATES } from "./account-state";
import { searchUsers, USER_SORT_KEYS, type UserListItem, type UserQuery } from "./api";
import { BulkUserActions } from "./bulk-actions";
import { userColumns } from "./columns";

const DEFAULT_SORT = { key: "createdAt", direction: "desc" } as const;
const LEVELS = ["0", "1", "2", "3"] as const;

/** `GET /flurrypay-website-admin/users/search` caps `limit` at 200. */
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 10_000;

export function UsersView() {
  const router = useRouter();
  const canManage = useHasPermission("users.manage");
  const table = useTableUrlState({ sortKeys: USER_SORT_KEYS, defaultSort: DEFAULT_SORT });
  const [filters, setFilters] = useQueryStates(
    { status: parseAsStringLiteral(ACCOUNT_STATES), level: parseAsStringLiteral(LEVELS) },
    { clearOnDefault: true },
  );
  const preferences = useTablePreferences("users", userColumns);
  const [selected, setSelected] = useState<Map<string, UserListItem>>(new Map());

  const filterValues = { search: table.search, status: filters.status, level: filters.level };
  const query: UserQuery = {
    ...filterValues,
    page: table.page,
    pageSize: table.pageSize,
    sortBy: (table.sort?.key ?? "createdAt") as UserQuery["sortBy"],
    sortOrder: table.sort?.direction ?? "desc",
  };
  const result = useQuery({
    queryKey: ["users", "search", query],
    queryFn: ({ signal }) => searchUsers(query, signal),
    placeholderData: keepPreviousData,
  });
  const pageRows = result.data?.rows ?? [];
  const total = result.data?.total ?? 0;

  const activeFilters = [filters.status, filters.level, table.search].filter(Boolean).length;
  const clearFilters = () => {
    void setFilters({ status: null, level: null });
    table.setSearch("");
  };
  const selectedIds = new Set(selected.keys());
  const setSelectedIds = (ids: Set<string>) => {
    setSelected((current) => {
      const next = new Map<string, UserListItem>();
      for (const id of ids) {
        const user = current.get(id) ?? pageRows.find((u) => u.id === id);
        if (user) next.set(id, user);
      }
      return next;
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search name, email, username, phone…"
        />
        <SelectFilter
          label="Status"
          value={filters.status}
          options={ACCOUNT_STATES.map((value) => ({ value, label: ACCOUNT_STATE[value].label }))}
          onChange={(status) => void setFilters({ status })}
        />
        <SelectFilter
          label="KYC level"
          value={filters.level}
          options={LEVELS.map((value) => ({ value, label: `Level ${value}` }))}
          onChange={(level) => void setFilters({ level })}
        />
        {activeFilters > 0 && (
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
            dataset="users"
            columns={preferences.orderedColumns}
            visibleColumnIds={preferences.visibleColumns.map((c) => c.id)}
            source={{
              pageRows,
              selectedRows: [...selected.values()],
              totalMatching: total,
              maxRows: EXPORT_MAX_ROWS,
              loadAll: async (signal, onProgress) => {
                const all: UserListItem[] = [];
                for (let page = 1; all.length < total; page++) {
                  const chunk = await searchUsers(
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

      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border bg-accent/40 px-3 py-1.5 text-sm"
          role="status"
        >
          <span>{selected.size} selected</span>
          {canManage && (
            <BulkUserActions
              users={[...selected.values()]}
              onFinished={() => {
                setSelected(new Map());
              }}
            />
          )}
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
        </div>
      )}

      <DataTable
        label="Users"
        subject="users"
        columns={preferences.visibleColumns}
        rows={pageRows}
        getRowId={(user) => user.id}
        density={preferences.density}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        sort={table.sort}
        onSortChange={table.setSort}
        selection={{ selected: selectedIds, onChange: setSelectedIds }}
        onRowActivate={(user) => {
          router.push(`/users/${user.id}` as Route);
        }}
        empty={
          activeFilters > 0
            ? {
                icon: FilterXIcon,
                title: "No customers match",
                description: "Check the spelling or clear some filters.",
                action: (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ),
              }
            : {
                icon: UsersIcon,
                title: "No customers yet",
                description:
                  "Customer accounts appear here once people sign up in the FlurryPay app.",
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
    </div>
  );
}
