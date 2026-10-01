import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type ExportCell = string | number | boolean | null | undefined;

export interface DataColumn<T> {
  id: string;
  header: string;
  /** Explains the column in a header tooltip (units, source, caveats). */
  description?: string;
  cell: (row: T) => ReactNode;
  /** Plain value for CSV export. Columns without it cannot be exported. */
  exportValue?: (row: T) => ExportCell;
  /** Column key(s) for server-generated exports, when they differ from `id`. */
  exportKeys?: readonly string[];
  /** Enables sorting. Sent to the server for server-driven tables. */
  sortKey?: string;
  /** Value used when sorting in memory. Required for client-sorted columns with a sortKey. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Hidden until the viewer enables it. */
  defaultHidden?: boolean;
  /** Always shown (e.g. the primary identifier). */
  required?: boolean;
  /** Personal or security-sensitive data: flagged in the column and export pickers. */
  sensitive?: boolean;
  /**
   * Responsive tier: "secondary" columns appear from the `md` breakpoint,
   * "tertiary" from `xl`, so the most important data stays visible on tablets and phones.
   */
  priority?: "primary" | "secondary" | "tertiary";
  align?: "left" | "right";
  className?: string;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

export type Density = "compact" | "comfortable";

export interface EmptyStateConfig {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}
