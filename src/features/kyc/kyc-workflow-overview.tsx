"use client";

import { ArrowRightIcon, CheckCheckIcon, FilesIcon, ScanFaceIcon, UsersIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { KycFilter, KycQueueSummary } from "./api";

const metrics = [
  {
    filter: "ready",
    key: "ready",
    label: "Ready for review",
    hint: "Level 3 evidence complete",
    icon: CheckCheckIcon,
    href: "/kyc?filter=ready",
  },
  {
    filter: "action_required",
    key: "actionRequired",
    label: "Needs customer action",
    hint: "Includes legacy follow-up",
    icon: ScanFaceIcon,
    href: "/kyc?filter=action_required",
  },
  {
    filter: "legacy",
    key: "legacy",
    label: "Legacy submissions",
    hint: "Previous flow · records retained",
    icon: FilesIcon,
    href: "/kyc?filter=legacy",
  },
  {
    filter: "all",
    key: "all",
    label: "All profiles",
    hint: "Across every verification tier",
    icon: UsersIcon,
    href: "/kyc?filter=all",
  },
] as const;

export function KycWorkflowOverview({
  summary,
  filter,
  onSelect,
  error = false,
}: {
  summary?: KycQueueSummary | null;
  filter?: KycFilter;
  onSelect?: (filter: KycFilter) => void;
  error?: boolean;
}) {
  return (
    <section aria-label="Customer verification overview" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Customer verification
          </p>
          <h2 className="mt-1 text-lg font-semibold">One connected identity. Three clear steps.</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          BVN and NIN run automatically. Admins review Level 3.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const body = (
            <>
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                {metric.label}
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="text-3xl font-semibold tabular-nums">
                {summary ? summary[metric.key].toLocaleString() : "—"}
              </span>
              <span className="text-xs text-muted-foreground">{metric.hint}</span>
            </>
          );
          const className = cn(
            "grid gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            filter === metric.filter && "border-primary bg-primary/5",
          );
          return onSelect ? (
            <button
              key={metric.key}
              type="button"
              className={className}
              aria-pressed={filter === metric.filter}
              onClick={() => {
                onSelect(metric.filter);
              }}
            >
              {body}
            </button>
          ) : (
            <Link key={metric.key} href={metric.href} className={className}>
              {body}
            </Link>
          );
        })}
      </div>
      {error && (
        <p role="status" className="text-xs text-destructive">
          Verification counts could not be loaded. Refresh to try again.
        </p>
      )}
      <ol className="grid gap-0 overflow-hidden rounded-xl border bg-card md:grid-cols-3">
        {[
          {
            title: "BVN verification",
            badge: "Automatic",
            detail: "Confirm the registry identity and legal details.",
          },
          {
            title: "NIN verification",
            badge: "Automatic",
            detail: "Match legal names, date of birth and gender to BVN.",
          },
          {
            title: "Live capture + address",
            badge: "Admin review",
            detail: "Match the live capture to NIN, then review proof of address.",
          },
        ].map((step, index) => (
          <li
            key={step.title}
            className="relative flex gap-3 border-b p-4 last:border-0 md:border-r md:border-b-0"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-semibold text-primary">
              0{index + 1}
            </span>
            <div className="grid gap-1 pr-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {step.badge}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
            </div>
            {index < 2 && (
              <ArrowRightIcon
                className="absolute top-6 right-2 hidden size-3.5 text-muted-foreground md:block"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
