"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Screen-reader description of what is searched. */
  description?: string;
  debounceMs?: number;
  className?: string;
}

/** Debounced search field that stays in sync with URL state. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  description,
  debounceMs = 350,
  className,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // The URL changed from elsewhere (back button, "Clear filters"): adopt it.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  const emit = useEffectEvent((next: string) => {
    onChange(next);
  });

  useEffect(() => {
    if (draft.trim() === value) return;
    const timer = window.setTimeout(() => {
      emit(draft.trim());
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, value, debounceMs]);

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-description={description}
        className="h-8 pr-8 pl-8"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
