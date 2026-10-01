"use client";

import { ChevronDownIcon, ChevronUpIcon, Columns3Icon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

import type { TablePreferences } from "./use-table-preferences";

/** "Customize columns": visibility, order and row density, saved per viewer. */
export function ColumnCustomizer<T>({ preferences }: { preferences: TablePreferences<T> }) {
  const { orderedColumns, isVisible, setVisible, move, density, setDensity, reset } = preferences;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3Icon aria-hidden />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Customize columns</p>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {orderedColumns.map((column, index) => {
            const id = `col-${column.id}`;
            return (
              <li key={column.id} className="flex items-center gap-2 px-3 py-1">
                <Checkbox
                  id={id}
                  checked={isVisible(column)}
                  disabled={column.required}
                  onCheckedChange={(value) => {
                    setVisible(column.id, value === true);
                  }}
                />
                <Label htmlFor={id} className="flex-1 font-normal">
                  {column.header}
                  {column.required && (
                    <LockIcon className="size-3 text-muted-foreground" aria-label="Always shown" />
                  )}
                  {column.sensitive && <span className="text-xs text-warning">Sensitive</span>}
                </Label>
                <span className="flex">
                  <button
                    type="button"
                    className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    onClick={() => {
                      move(column.id, -1);
                    }}
                    disabled={index === 0}
                    aria-label={`Move ${column.header} up`}
                  >
                    <ChevronUpIcon className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    onClick={() => {
                      move(column.id, 1);
                    }}
                    disabled={index === orderedColumns.length - 1}
                    aria-label={`Move ${column.header} down`}
                  >
                    <ChevronDownIcon className="size-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Label htmlFor="density-toggle" className="font-normal">
            Comfortable rows
          </Label>
          <Switch
            id="density-toggle"
            checked={density === "comfortable"}
            onCheckedChange={(checked) => {
              setDensity(checked ? "comfortable" : "compact");
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
