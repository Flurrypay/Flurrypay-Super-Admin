"use client";

import { TableIcon } from "lucide-react";
import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ChartSeries {
  name: string;
  /** A CSS color, normally `var(--viz-n)` in fixed slot order. */
  color: string;
}

export interface ColumnDatum {
  key: string;
  /** Axis and tooltip label, e.g. "3 Sep". */
  label: string;
  /** One value per series, bottom of the stack first. */
  values: number[];
}

interface ColumnChartProps {
  /** Accessible name; also the table caption. */
  label: string;
  series: ChartSeries[];
  data: ColumnDatum[];
  height?: number;
  /** Dims the previous render while new data loads. */
  isFetching?: boolean;
}

const MARGIN = { top: 12, right: 8, bottom: 24, left: 44 };
const GAP = 2;
const MAX_BAR = 24;
const RADIUS = 4;

/** Clean axis steps (1, 2, 5 × 10ⁿ, integers only) giving about four intervals. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rough = max / 4;
  const exponent = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, ([1, 2, 5, 10].find((m) => m * exponent >= rough) ?? 10) * exponent);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

/** Column path with a rounded data end and a square base. */
function columnPath(x: number, y: number, width: number, height: number, round: boolean): string {
  const r = round ? Math.min(RADIUS, width / 2, height) : 0;
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    r ? `Q${x},${y} ${x + r},${y}` : "",
    `H${x + width - r}`,
    r ? `Q${x + width},${y} ${x + width},${y + r}` : "",
    `V${y + height}`,
    "Z",
  ].join(" ");
}

/**
 * Stacked columns (one per category, e.g. per day) with a legend, per-column
 * tooltips reachable by pointer and arrow keys, and a table view carrying every
 * value.
 */
export function ColumnChart({ label, series, data, height = 220, isFetching }: ColumnChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tooltipId = useId();

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const totals = data.map((d) => d.values.reduce((sum, v) => sum + v, 0));
  const { top: yMax, ticks } = niceScale(Math.max(0, ...totals));
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const band = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - GAP));
  const y = (value: number) => plotHeight - (value / yMax) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotWidth / 64))));

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (data.length === 0) return;
    const current = active ?? -1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = Math.min(data.length - 1, current + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, current <= 0 ? 0 : current - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = data.length - 1;
    else if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  }

  const activeDatum = active !== null ? data[active] : undefined;
  // Beside the hovered column, flipping left near the right edge, so it never covers it.
  const TOOLTIP_WIDTH = 168;
  const columnLeft = active !== null ? MARGIN.left + band * active : 0;
  const tooltipLeft =
    columnLeft + band + 8 + TOOLTIP_WIDTH <= width
      ? columnLeft + band + 8
      : Math.max(0, columnLeft - TOOLTIP_WIDTH - 8);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-[2px]"
                style={{ background: s.color }}
                aria-hidden
              />
              {s.name}
            </span>
          ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          aria-pressed={showTable}
          onClick={() => {
            setShowTable((v) => !v);
          }}
        >
          <TableIcon aria-hidden />
          {showTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">
                  Date
                </th>
                {series.map((s) => (
                  <th key={s.name} scope="col" className="px-3 py-1.5 text-right font-medium">
                    {s.name}
                  </th>
                ))}
                {series.length > 1 && (
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.key} className="border-t">
                  <th scope="row" className="px-3 py-1 text-left font-normal">
                    {d.label}
                  </th>
                  {d.values.map((v, j) => (
                    <td key={series[j]?.name ?? j} className="px-3 py-1 text-right tabular-nums">
                      {formatCount(v)}
                    </td>
                  ))}
                  {series.length > 1 && (
                    <td className="px-3 py-1 text-right font-medium tabular-nums">
                      {formatCount(totals[i] ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={cn("relative transition-opacity", isFetching && "opacity-60")}
          style={{ height }}
        >
          {width > 0 && (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`${label}. Use the left and right arrow keys to read each value, or show the table.`}
              aria-describedby={activeDatum ? tooltipId : undefined}
              tabIndex={0}
              className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onKeyDown={onKeyDown}
              onBlur={() => {
                setActive(null);
              }}
              onPointerLeave={() => {
                setActive(null);
              }}
            >
              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {ticks.map((tick) => (
                  <g key={tick} transform={`translate(0,${y(tick)})`}>
                    <line x1={0} x2={plotWidth} stroke="var(--viz-grid)" strokeWidth={1} />
                    <text
                      x={-8}
                      dy="0.32em"
                      textAnchor="end"
                      className="fill-muted-foreground text-[11px] tabular-nums"
                    >
                      {formatCount(tick)}
                    </text>
                  </g>
                ))}
                {data.map((d, i) => {
                  const x = band * i + (band - barWidth) / 2;
                  let base = 0;
                  const top = d.values.findLastIndex((v) => v > 0);
                  return (
                    <g key={d.key} opacity={active !== null && active !== i ? 0.55 : 1}>
                      {d.values.map((v, j) => {
                        if (v <= 0) return null;
                        const y0 = y(base);
                        base += v;
                        const y1 = y(base);
                        // 2px surface gap between stacked segments.
                        const h = Math.max(0, y0 - y1 - (j > 0 ? GAP : 0));
                        return (
                          <path
                            key={series[j]?.name ?? j}
                            d={columnPath(x, y1, barWidth, h, j === top)}
                            fill={series[j]?.color}
                          />
                        );
                      })}
                      {/* Hit target: the whole band, taller than the mark. */}
                      <rect
                        x={band * i}
                        y={0}
                        width={band}
                        height={plotHeight}
                        fill="transparent"
                        onPointerEnter={() => {
                          setActive(i);
                        }}
                      />
                      {i % labelEvery === 0 && (
                        <text
                          x={x + barWidth / 2}
                          y={plotHeight + 16}
                          textAnchor="middle"
                          className="fill-muted-foreground text-[11px]"
                        >
                          {d.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          {activeDatum && (
            <div
              id={tooltipId}
              role="status"
              className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
              style={{ left: tooltipLeft, width: TOOLTIP_WIDTH }}
            >
              <p className="mb-1 text-muted-foreground">{activeDatum.label}</p>
              <ul className="grid gap-0.5">
                {series.map((s, j) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-3 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <span className="font-semibold tabular-nums">
                      {formatCount(activeDatum.values[j] ?? 0)}
                    </span>
                    <span className="text-muted-foreground">{s.name}</span>
                  </li>
                ))}
                {series.length > 1 && (
                  <li className="mt-0.5 border-t pt-0.5">
                    <span className="font-semibold tabular-nums">
                      {formatCount(totals[active ?? 0] ?? 0)}
                    </span>{" "}
                    <span className="text-muted-foreground">total</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
