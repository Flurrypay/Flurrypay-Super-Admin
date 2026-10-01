"use client";

import { CalendarIcon, CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTimeZoneLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

import {
  DATE_PRESET_LABELS,
  DATE_PRESETS,
  type DateRangeValue,
  describeDateRange,
} from "./date-range";

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  label?: string;
}

const EMPTY: DateRangeValue = { range: null, from: null, to: null };

export function DateRangeFilter({ value, onChange, label = "Date" }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const summary = describeDateRange(value);
  const customInvalid = Boolean(from && to && from > to);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFrom(value.from ?? "");
          setTo(value.to ?? "");
        }
      }}
    >
      <div className="flex items-center">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(summary && "rounded-r-none border-r-0 bg-accent/40")}
          >
            <CalendarIcon aria-hidden />
            {summary ? (
              <span>
                <span className="text-muted-foreground">{label}: </span>
                {summary}
              </span>
            ) : (
              label
            )}
          </Button>
        </PopoverTrigger>
        {summary && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-l-none bg-accent/40 px-2"
            onClick={() => {
              onChange(EMPTY);
            }}
            aria-label={`Clear ${label.toLowerCase()} filter`}
          >
            <XIcon aria-hidden />
          </Button>
        )}
      </div>
      <PopoverContent className="w-64 p-1.5">
        <ul role="listbox" aria-label={`${label} presets`} className="grid">
          {DATE_PRESETS.map((preset) => (
            <li key={preset} role="option" aria-selected={value.range === preset}>
              <button
                type="button"
                className="flex h-8 w-full items-center justify-between rounded-sm px-2 text-sm hover:bg-muted"
                onClick={() => {
                  onChange({ range: preset, from: null, to: null });
                  setOpen(false);
                }}
              >
                {DATE_PRESET_LABELS[preset]}
                {value.range === preset && <CheckIcon className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-1.5 grid gap-2 border-t px-2 pt-2.5 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!from || !to || customInvalid) return;
            onChange({ range: "custom", from, to });
            setOpen(false);
          }}
        >
          <p className="text-xs font-medium">Custom range ({getTimeZoneLabel()})</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="range-from" className="text-xs font-normal text-muted-foreground">
                From
              </Label>
              <Input
                id="range-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                }}
                className="h-8 px-2 text-xs"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="range-to" className="text-xs font-normal text-muted-foreground">
                To
              </Label>
              <Input
                id="range-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                }}
                className="h-8 px-2 text-xs"
              />
            </div>
          </div>
          {customInvalid && (
            <p className="text-xs text-destructive">The start date must be before the end date.</p>
          )}
          <Button type="submit" size="sm" disabled={!from || !to || customInvalid}>
            Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
