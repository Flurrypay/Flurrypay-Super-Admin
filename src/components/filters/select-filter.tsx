"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

interface SelectFilterProps<V extends string> {
  label: string;
  value: V | null;
  options: readonly { value: V; label: string }[];
  onChange: (value: V | null) => void;
  className?: string;
}

/** Single-value filter. "All" clears it. */
export function SelectFilter<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SelectFilterProps<V>) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => {
        onChange(next === ALL ? null : (next as V));
      }}
    >
      <SelectTrigger
        aria-label={label}
        className={cn("h-8 w-auto min-w-36 gap-1.5 text-sm", value && "bg-accent/40", className)}
      >
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
