"use client";

import { RouteIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NavItem } from "@/config/navigation";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly NavItem[];
  onStartTour: () => void;
}

export function HelpDialog({ open, onOpenChange, items, onStartTour }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
          <DialogDescription>
            How the console works, what its terms mean, and how to move quickly.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="shortcuts">
          <TabsList>
            <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
            <TabsTrigger value="terms">Terminology</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="data">Data & exports</TabsTrigger>
          </TabsList>

          <TabsContent value="shortcuts">
            <dl className="grid gap-y-2 text-sm sm:grid-cols-[1fr_auto]">
              <Shortcut keys={["⌘", "K"]} label="Search (Ctrl K on Windows and Linux)" />
              <Shortcut keys={["?"]} label="Open this help" />
              {items.map((item) => (
                <Shortcut
                  key={item.id}
                  keys={["G", item.shortcut.toUpperCase()]}
                  label={`Go to ${item.label}`}
                />
              ))}
              <Shortcut keys={["Enter"]} label="Open the focused table row" />
              <Shortcut keys={["Esc"]} label="Close a dialog or drawer" />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Letter shortcuts are ignored while you are typing in a field.
            </p>
          </TabsContent>

          <TabsContent value="terms" className="grid gap-3 text-sm">
            <Term title="Block, suspend and freeze">
              <strong>Block</strong> locks the customer out entirely and ends their session.{" "}
              <strong>Suspend</strong> stops them transacting. <strong>Freeze</strong> holds
              outbound transfers, bill payments and crypto purchases while inbound funds still
              arrive. Each can be reversed.
            </Term>
            <Term title="KYC levels">
              Level 1 verifies identity (BVN or NIN), level 2 verifies address, level 3 verifies a
              government ID with a face match. Each approved level raises the customer&apos;s
              withdrawal limit.
            </Term>
            <Term title="Pending vs processing">
              <strong>Pending</strong> has not been sent anywhere yet. <strong>Processing</strong>{" "}
              has been submitted to a provider and is awaiting its result. Only{" "}
              <strong>Reversed</strong> means funds were returned.
            </Term>
            <Term title="Amounts">
              Amounts are shown exactly as the ledger stores them, with no rounding. Naira values of
              crypto holdings are estimates at the current rate.
            </Term>
            <Term title="Stranded transfer">
              A transfer where the customer was debited but the money was neither confirmed
              delivered nor returned. Resolve it as <strong>delivered</strong> (no money moves) or{" "}
              <strong>refund</strong> (the principal goes back to the customer).
            </Term>
            <Term title="Holds and cases">
              A <strong>hold</strong> stops part of a customer&apos;s naira balance being spent; the
              rest stays usable. A <strong>case</strong> is the review behind it. Clearing a case
              releases its holds.
            </Term>
            <Term title="Alerts and reports">
              Monitoring raises <strong>alerts</strong> for review. An alert can be escalated into a
              suspicious activity <strong>report</strong>, which the MLRO assesses and, if
              sustained, files with the NFIU. Disclosing a report to the customer is an offence.
            </Term>
            <Term title="Coverage">
              The settlement account balance minus what customers hold in their naira wallets.
              Negative coverage means the company is under-funded.
            </Term>
            <Term title="Times">
              Times are shown in West Africa Time (WAT). Hover any time to see the exact UTC value
              that logs and support use.
            </Term>
          </TabsContent>

          <TabsContent value="security" className="grid gap-3 text-sm">
            <Term title="Additional verification">
              Sensitive actions ask again for your authenticator code, and sometimes your password
              or 6-digit transaction PIN. Set both up under Security.
            </Term>
            <Term title="Sessions">
              A session renews automatically while you are working and ends after 12 hours, or after
              2 hours idle. Signing in elsewhere ends this session. Closing the tab signs you out on
              this device.
            </Term>
            <Term title="Trusted devices">
              Staff accounts are bound to the browser they signed in on. A new device needs an email
              code and an SMS code before it can be used.
            </Term>
            <Term title="Permissions and roles">
              The menu only shows what your permissions allow. Hiding an option is not what protects
              it: the FlurryPay API checks every request, and anything it refuses is shown as an
              error. A <strong>role</strong> is a named permission set; editing it updates everyone
              assigned to it.
            </Term>
            <Term title="Recovery codes">
              One-time codes that sign you in if you lose your authenticator. Generate them under
              Security and store them offline. Each works once.
            </Term>
          </TabsContent>

          <TabsContent value="data" className="grid gap-3 text-sm">
            <Term title="Freshness">
              Pages load data when opened and show when it was last updated. Nothing updates in real
              time: use Refresh for the latest figures.
            </Term>
            <Term title="Exports">
              Export downloads the current page, your selected rows, or every row matching the
              filters. Exports of all rows for customers, transactions and the audit log are built
              by the server as CSV or Excel and recorded in the audit log. Files containing personal
              data are flagged: store them securely.
            </Term>
            <Term title="Sharing a view">
              Filters, search, sorting and page are kept in the address bar, so you can bookmark or
              share a view with a colleague who has the same access.
            </Term>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onStartTour();
            }}
          >
            <RouteIcon aria-hidden />
            Restart the tour
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex gap-1 sm:justify-end">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </dd>
    </>
  );
}

function Term({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <h3 className="font-medium">{title}</h3>
      <p className="text-muted-foreground">{children}</p>
    </section>
  );
}
