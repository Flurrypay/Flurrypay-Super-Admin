import { formatAmount, isNegativeAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AmountProps {
  value: unknown;
  currency: string | null | undefined;
  /** Show "+" on positive values and colour by direction (ledgers). */
  signed?: boolean;
  className?: string;
}

/** Exact, tabular amount display. Direction is carried by the sign, not colour alone. */
export function Amount({ value, currency, signed = false, className }: AmountProps) {
  const negative = isNegativeAmount(value);
  return (
    <span
      className={cn(
        "font-medium whitespace-nowrap tabular-nums",
        signed && (negative ? "text-destructive" : "text-success"),
        className,
      )}
    >
      {formatAmount(value, currency, { signed })}
    </span>
  );
}
