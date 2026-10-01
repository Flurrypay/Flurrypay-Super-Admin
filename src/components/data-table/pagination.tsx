"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCount } from "@/lib/format";

export const PAGE_SIZES = [25, 50, 100, 200] as const;

interface PaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm text-muted-foreground"
    >
      <div className="flex items-center gap-2">
        <span id="rows-per-page">Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            onPageSizeChange(Number(value));
          }}
        >
          <SelectTrigger className="h-8 w-20" aria-labelledby="rows-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular-nums" aria-live="polite">
          {formatCount(from)}–{formatCount(to)} of {formatCount(total)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => {
              onPageChange(page - 1);
            }}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <span className="min-w-20 text-center tabular-nums">
            Page {formatCount(page)} of {formatCount(pageCount)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => {
              onPageChange(page + 1);
            }}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  );
}
