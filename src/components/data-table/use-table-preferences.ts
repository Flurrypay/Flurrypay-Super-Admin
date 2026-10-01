"use client";

import { useCallback, useMemo, useState } from "react";

import type { DataColumn, Density } from "./types";

interface StoredPreferences {
  hidden: string[];
  shown: string[];
  order: string[];
  density: Density;
}

const EMPTY: StoredPreferences = { hidden: [], shown: [], order: [], density: "compact" };

function storageKey(tableId: string) {
  return `fp.table.${tableId}.v1`;
}

function read(tableId: string): StoredPreferences {
  try {
    const raw = window.localStorage.getItem(storageKey(tableId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      shown: Array.isArray(parsed.shown) ? parsed.shown : [],
      order: Array.isArray(parsed.order) ? parsed.order : [],
      density: parsed.density === "comfortable" ? "comfortable" : "compact",
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Per-viewer column visibility, order and density, persisted in localStorage.
 * These are conveniences only: losing them (private mode, cleared storage)
 * simply restores the defaults.
 */
export function useTablePreferences<T>(tableId: string, columns: readonly DataColumn<T>[]) {
  // Tables render client-side only (inside the authenticated console), so storage is available here.
  const [prefs, setPrefs] = useState<StoredPreferences>(() =>
    typeof window === "undefined" ? EMPTY : read(tableId),
  );

  const update = useCallback(
    (next: (current: StoredPreferences) => StoredPreferences) => {
      setPrefs((current) => {
        const value = next(current);
        try {
          window.localStorage.setItem(storageKey(tableId), JSON.stringify(value));
        } catch {
          // Storage unavailable: keep the preference for this page view only.
        }
        return value;
      });
    },
    [tableId],
  );

  const orderedColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c]));
    const ordered = prefs.order.flatMap((id) => {
      const column = byId.get(id);
      return column ? [column] : [];
    });
    const rest = columns.filter((c) => !prefs.order.includes(c.id));
    return [...ordered, ...rest];
  }, [columns, prefs.order]);

  const isVisible = useCallback(
    (column: DataColumn<T>) => {
      if (column.required) return true;
      if (prefs.hidden.includes(column.id)) return false;
      if (prefs.shown.includes(column.id)) return true;
      return !column.defaultHidden;
    },
    [prefs.hidden, prefs.shown],
  );

  const visibleColumns = useMemo(
    () => orderedColumns.filter(isVisible),
    [orderedColumns, isVisible],
  );

  const setVisible = useCallback(
    (id: string, visible: boolean) => {
      update((p) => ({
        ...p,
        hidden: visible ? p.hidden.filter((h) => h !== id) : [...new Set([...p.hidden, id])],
        shown: visible ? [...new Set([...p.shown, id])] : p.shown.filter((s) => s !== id),
      }));
    },
    [update],
  );

  const move = useCallback(
    (id: string, offset: -1 | 1) => {
      update((p) => {
        const order = orderedColumns.map((c) => c.id);
        const index = order.indexOf(id);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= order.length) return p;
        [order[index], order[target]] = [order[target] as string, order[index] as string];
        return { ...p, order };
      });
    },
    [orderedColumns, update],
  );

  const setDensity = useCallback(
    (density: Density) => {
      update((p) => ({ ...p, density }));
    },
    [update],
  );

  const reset = useCallback(() => {
    update(() => EMPTY);
  }, [update]);

  return {
    orderedColumns,
    visibleColumns,
    isVisible,
    setVisible,
    move,
    density: prefs.density,
    setDensity,
    reset,
  };
}

export type TablePreferences<T> = ReturnType<typeof useTablePreferences<T>>;
