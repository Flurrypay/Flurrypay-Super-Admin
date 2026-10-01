import type { DataColumn, ExportCell } from "@/components/data-table/types";

/** Leading characters spreadsheet apps treat as formulas (CSV/formula injection). */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function escapeCell(value: ExportCell): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);
  // Numeric values (including negative amounts) are safe; only neutralise text that could execute.
  if (typeof value === "string" && FORMULA_TRIGGER.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly DataColumn<T>[]): string {
  const exportable = columns.filter((c) => c.exportValue);
  const header = exportable.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) =>
    exportable.map((c) => escapeCell(c.exportValue?.(row))).join(","),
  );
  return [header, ...lines].join("\r\n");
}

/** Byte-order mark so Excel reads UTF-8 (₦, names) correctly. */
const UTF8_BOM = "\uFEFF";

export function downloadCsv(csv: string, fileName: string) {
  downloadBlob(
    new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" }),
    fileName.endsWith(".csv") ? fileName : `${fileName}.csv`,
  );
}

/** Triggers a browser download of an in-memory file. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportFileName(dataset: string, date: Date = new Date()): string {
  const stamp = date.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `flurrypay-${dataset}-${stamp}.csv`;
}
