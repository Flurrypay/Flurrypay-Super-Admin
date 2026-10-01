import { CircleHelpIcon, type LucideIcon } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { humanizeEnum } from "@/lib/format";

export interface StatusDefinition {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
  /** Operational meaning, shown in a tooltip. */
  description?: string;
}

export type StatusMap<K extends string> = Record<K, StatusDefinition>;

/** Looks up a status, falling back to a neutral badge for values the UI does not know yet. */
export function resolveStatus<K extends string>(
  map: StatusMap<K>,
  value: string | null | undefined,
): StatusDefinition {
  if (value && value in map) return map[value as K];
  return {
    label: value ? humanizeEnum(value) : "Unknown",
    tone: "neutral",
    icon: CircleHelpIcon,
    description: value ? `Unrecognised status "${value}"` : undefined,
  };
}

/** Icon + text + tone: status is never conveyed by colour alone. */
export function StatusBadge({ status }: { status: StatusDefinition }) {
  const Icon = status.icon;
  const badge = (
    <Badge tone={status.tone}>
      <Icon aria-hidden />
      {status.label}
    </Badge>
  );
  if (!status.description) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent>{status.description}</TooltipContent>
    </Tooltip>
  );
}
