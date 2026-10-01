"use client";

import { XIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { NavItem } from "@/config/navigation";

interface TourStep {
  /** `data-tour` attribute of the element to highlight; centred when missing or hidden. */
  target: string;
  title: string;
  body: string;
}

interface ProductTourProps {
  adminId: string;
  items: readonly NavItem[];
  active: boolean;
  onActiveChange: (active: boolean) => void;
}

const STORAGE_PREFIX = "fp.tour.v1.";
const CARD_WIDTH = 320;

type TourRecord = { status: "completed" | "skipped" } | { status: "in-progress"; step: number };

function readRecord(adminId: string): TourRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + adminId);
    return raw ? (JSON.parse(raw) as TourRecord) : null;
  } catch {
    return null;
  }
}

function writeRecord(adminId: string, record: TourRecord) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + adminId, JSON.stringify(record));
  } catch {
    // Without storage the tour may reappear next visit; it stays skippable.
  }
}

const MODULE_STEPS: Record<string, Omit<TourStep, "target">> = {
  overview: {
    title: "Overview",
    body: "Starts with what needs attention: failed and pending transactions, the KYC queue, and recent administrator actions.",
  },
  users: {
    title: "Users",
    body: "Customer accounts. Open one to see balances, wallets, transactions, activity and account controls on a single page.",
  },
  transactions: {
    title: "Transactions",
    body: "The full ledger with filters kept in the URL. Click a row for a quick view without leaving the list.",
  },
  kyc: {
    title: "KYC review",
    body: "The verification queue. Approving a level raises the customer's limits; rejecting requires a reason they will see.",
  },
  audit: {
    title: "Audit log",
    body: "Every recorded administrator action, with who, when, from which IP, and the details captured.",
  },
  administrators: {
    title: "Administrators",
    body: "Invite staff, assign a role or individual permissions, and suspend or remove access. Changes need your authenticator code.",
  },
  reports: {
    title: "Reports",
    body: "Transactions and sign-ups per day over any period up to a year, with a table view of every value.",
  },
  stranded: {
    title: "Stranded transfers",
    body: "Customers who were debited for a transfer that was neither delivered nor returned. Check here daily.",
  },
  compliance: {
    title: "Compliance",
    body: "Monitoring alerts and the suspicious activity report register. Never tell a customer a report exists.",
  },
  treasury: {
    title: "Treasury",
    body: "Whether the settlement account covers what customers hold, plus payout accounts and earnings.",
  },
};

function buildSteps(items: readonly NavItem[]): TourStep[] {
  const steps: TourStep[] = [
    {
      target: "sidebar",
      title: "Navigation",
      body: "Modules are grouped by job. You only see the ones your role allows. Collapse the sidebar for more room.",
    },
    {
      target: "search",
      title: "Search",
      body: "Press ⌘K (Ctrl K) from anywhere to find customers, wallet addresses, transactions by reference, administrators, or any page.",
    },
  ];
  for (const item of items) {
    const content = MODULE_STEPS[item.id];
    if (content) steps.push({ target: `nav-${item.id}`, ...content });
  }
  steps.push(
    {
      target: "security-status",
      title: "Your security",
      body: "Shows whether two-factor authentication and your transaction PIN are set. Sensitive actions need both.",
    },
    {
      target: "account",
      title: "Help is always here",
      body: "Open Help & shortcuts from this menu (or press ?) for terminology and keyboard shortcuts, or to restart this tour.",
    },
  );
  return steps;
}

function findTarget(target: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
}

/** Skippable first-run walkthrough. Progress is remembered per administrator on this device. */
export function ProductTour({ adminId, items, active, onActiveChange }: ProductTourProps) {
  const steps = useMemo(() => buildSteps(items), [items]);
  const [index, setIndex] = useState(() => {
    const record = typeof window === "undefined" ? null : readRecord(adminId);
    return record?.status === "in-progress" ? Math.min(record.step, steps.length - 1) : 0;
  });
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Start automatically on first visit, or resume an unfinished tour. Otherwise only via Help.
  useEffect(() => {
    const record = readRecord(adminId);
    if (!record || record.status === "in-progress") onActiveChange(true);
  }, [adminId, onActiveChange]);

  const step = steps[Math.min(index, steps.length - 1)];

  const measure = useCallback(() => {
    if (!step) return;
    const node = findTarget(step.target);
    node?.scrollIntoView({ block: "nearest" });
    setRect(node ? node.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  const finish = useCallback(
    (status: "completed" | "skipped") => {
      writeRecord(adminId, { status });
      setIndex(0);
      onActiveChange(false);
    },
    [adminId, onActiveChange],
  );

  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish("skipped");
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [active, finish]);

  if (!active || !step) return null;

  const isLast = index === steps.length - 1;
  const go = (next: number) => {
    setIndex(next);
    writeRecord(adminId, { status: "in-progress", step: next });
  };

  const pad = 6;
  const cardStyle = rect
    ? {
        top: Math.min(rect.bottom + 12, window.innerHeight - 220),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - CARD_WIDTH - 12)),
      }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-md ring-2 ring-primary transition-all duration-150 motion-reduce:transition-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow:
              "0 0 0 9999px color-mix(in oklab, var(--color-charcoal-950) 45%, transparent)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-charcoal-950/45" />
      )}
      <div
        className="fixed grid gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
        style={{ width: CARD_WIDTH, maxWidth: "calc(100vw - 24px)", ...cardStyle }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">
              {index + 1} of {steps.length}
            </p>
            <h2 id="tour-title" className="text-sm font-semibold">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              finish("skipped");
            }}
            aria-label="Skip tour"
          >
            <XIcon className="size-4" aria-hidden />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              finish("skipped");
            }}
          >
            Skip tour
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  go(index - 1);
                }}
              >
                Back
              </Button>
            )}
            <Button
              size="sm"
              autoFocus
              onClick={() => {
                if (isLast) finish("completed");
                else go(index + 1);
              }}
            >
              {isLast ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
