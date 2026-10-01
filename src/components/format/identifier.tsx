"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { maskIdentifier, truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";

interface IdentifierProps {
  value: string | null | undefined;
  /** Mask all but the last four characters (BVN, NIN, account numbers). Masked values cannot be copied. */
  masked?: boolean;
  /** Shorten long opaque IDs in the middle; the full value stays available in the tooltip and copy. */
  truncate?: boolean;
  copyable?: boolean;
  label?: string;
  className?: string;
}

/** Monospace technical identifier with optional masking and copy-to-clipboard. */
export function Identifier({
  value,
  masked = false,
  truncate = false,
  copyable = true,
  label = "identifier",
  className,
}: IdentifierProps) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;

  const display = masked ? maskIdentifier(value) : truncate ? truncateMiddle(value) : value;
  const canCopy = copyable && !masked;

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      // Clipboard permission denied; the value remains selectable.
    }
  }

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1", className)}>
      <span
        className="truncate font-mono text-[0.8125rem]"
        title={masked ? undefined : value}
        aria-label={masked ? `${label} ending ${value.slice(-4)}` : undefined}
      >
        {display}
      </span>
      {canCopy && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void copy()}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Copy ${label}`}
            >
              {copied ? (
                <CheckIcon className="size-3.5" aria-hidden />
              ) : (
                <CopyIcon className="size-3.5" aria-hidden />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : `Copy ${label}`}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
