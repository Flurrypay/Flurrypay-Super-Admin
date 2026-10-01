"use client";

import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo } from "react";

import { PAGE_SIZES } from "./pagination";
import type { SortState } from "./types";

const sizeParser = parseAsInteger.withDefault(50);

interface UrlTableOptions {
  defaultSort?: SortState | null;
  /** Sort keys the table accepts; anything else in the URL is ignored. */
  sortKeys: readonly string[];
}

/**
 * Paging, sorting and search held in the URL (`?page=2&size=50&sort=createdAt.desc&q=…`)
 * so views can be shared, bookmarked and survive refresh and back/forward navigation.
 */
export function useTableUrlState({ defaultSort = null, sortKeys }: UrlTableOptions) {
  const [state, setState] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      size: sizeParser,
      sort: parseAsString,
      dir: parseAsStringLiteral(["asc", "desc"] as const),
      q: parseAsString.withDefault(""),
    },
    { clearOnDefault: true },
  );

  const sort = useMemo<SortState | null>(() => {
    if (state.sort && sortKeys.includes(state.sort)) {
      return { key: state.sort, direction: state.dir ?? "desc" };
    }
    return state.sort === "none" ? null : defaultSort;
  }, [state.sort, state.dir, sortKeys, defaultSort]);

  const pageSize = (PAGE_SIZES as readonly number[]).includes(state.size) ? state.size : 50;
  const page = Math.max(1, state.page);

  return {
    page,
    pageSize,
    sort,
    search: state.q,
    setPage: (next: number) => void setState({ page: next }),
    setPageSize: (next: number) => void setState({ size: next, page: 1 }),
    setSort: (next: SortState | null) =>
      void setState({ sort: next ? next.key : "none", dir: next ? next.direction : null, page: 1 }),
    setSearch: (next: string) => void setState({ q: next, page: 1 }),
  };
}
