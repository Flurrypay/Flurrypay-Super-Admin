"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  CircleXIcon,
  LoaderCircleIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SnowflakeIcon,
  SunIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startStepUp } from "@/features/security/api";
import { getUserMessage } from "@/lib/api/errors";
import { formatCount } from "@/lib/format";

import {
  type AccountControlStepUp,
  freezeUser,
  suspendUser,
  unfreezeUser,
  unsuspendUser,
  type UserListItem,
} from "./api";
import { userDisplayName } from "./queries";

/** Upper bound per run; each account is a separate, audited API call. */
export const BULK_ACTION_LIMIT = 100;
const REASON_MIN = 10;

type BulkActionId = "suspend" | "unsuspend" | "freeze" | "unfreeze";

interface BulkActionSpec {
  label: string;
  icon: typeof PauseCircleIcon;
  impact: string;
  needsReason: boolean;
  /** Accounts already in the target state are skipped, not re-sent. */
  applies: (user: UserListItem) => boolean;
  run: (id: string, reason: string, stepUp: AccountControlStepUp) => Promise<unknown>;
}

const BULK_ACTIONS: Record<BulkActionId, BulkActionSpec> = {
  suspend: {
    label: "Suspend transacting",
    icon: PauseCircleIcon,
    impact: "Each customer can still sign in but cannot transact, and is emailed your reason.",
    needsReason: true,
    applies: (u) => !u.isSuspended,
    run: (id, reason, stepUp) => suspendUser(id, reason, stepUp),
  },
  unsuspend: {
    label: "Lift suspension",
    icon: PlayCircleIcon,
    impact: "Each customer can transact again.",
    needsReason: false,
    applies: (u) => u.isSuspended,
    run: (id, _reason, stepUp) => unsuspendUser(id, stepUp),
  },
  freeze: {
    label: "Freeze outbound funds",
    icon: SnowflakeIcon,
    impact:
      "Outbound transfers, bills and crypto purchases are held for each customer; inbound funds still arrive. Each is emailed your reason.",
    needsReason: true,
    applies: (u) => !u.outboundRestricted,
    run: (id, reason, stepUp) => freezeUser(id, reason, stepUp),
  },
  unfreeze: {
    label: "Unfreeze outbound funds",
    icon: SunIcon,
    impact: "Outbound transfers, bills and crypto purchases are allowed again.",
    needsReason: false,
    applies: (u) => u.outboundRestricted,
    run: (id, _reason, stepUp) => unfreezeUser(id, stepUp),
  },
};

type Outcome = { status: "done" } | { status: "skipped" } | { status: "failed"; message: string };

interface BulkUserActionsProps {
  users: readonly UserListItem[];
  /** Called when the results dialog is closed after a run. */
  onFinished: () => void;
}

/**
 * Suspend, freeze and their reversals for several customers. Calls run one at a
 * time so each is audited individually and one failure never hides the rest.
 * Blocking is deliberately excluded: it signs customers out and claws back
 * referral rewards, so it stays a one-customer action.
 */
export function BulkUserActions({ users, onFinished }: BulkUserActionsProps) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<BulkActionId | null>(null);
  // The customers as they were when the action was chosen; the list refreshes underneath.
  const [batch, setBatch] = useState<readonly UserListItem[]>([]);
  const [reason, setReason] = useState("");
  // Exchanged once for a 5-minute grant before the run starts. A code itself
  // could not carry the run: it rotates every 30 seconds, and this makes one
  // request per customer.
  const [twoFACode, setTwoFACode] = useState("");
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Map<string, Outcome> | null>(null);
  const cancelled = useRef(false);
  const isCancelled = () => cancelled.current;

  const spec = action ? BULK_ACTIONS[action] : null;
  const tooMany = users.length > BULK_ACTION_LIMIT;
  const targets = spec ? batch.filter(spec.applies) : [];
  const skipped = batch.length - targets.length;
  const reasonValid = !spec?.needsReason || reason.trim().length >= REASON_MIN;
  const codeValid = /^\d{6}$/.test(twoFACode.trim());
  const finished = outcomes !== null && !running;

  function close() {
    if (running) {
      cancelled.current = true;
      return;
    }
    if (outcomes) onFinished();
    setAction(null);
    setReason("");
    setTwoFACode("");
    setStepUpError(null);
    setOutcomes(null);
  }

  function choose(id: BulkActionId) {
    setBatch([...users]);
    setAction(id);
  }

  async function run() {
    if (!spec) return;
    setStepUpError(null);

    // One code, exchanged for a grant that covers the whole run. Done before
    // anything is changed so a wrong code costs nothing — the alternative is
    // discovering it on customer forty and leaving the batch half applied.
    let grant: AccountControlStepUp;
    try {
      const result = await startStepUp(twoFACode.trim());
      grant = { grant: result.grant };
    } catch (error) {
      setStepUpError(getUserMessage(error));
      return;
    }

    cancelled.current = false;
    setRunning(true);
    const results = new Map<string, Outcome>(
      batch.filter((u) => !spec.applies(u)).map((u) => [u.id, { status: "skipped" }]),
    );
    setOutcomes(new Map(results));
    for (const user of targets) {
      // Set by "Stop after current" while awaiting; read through a call so it isn't narrowed.
      if (isCancelled()) break;
      try {
        await spec.run(user.id, reason.trim(), grant);
        results.set(user.id, { status: "done" });
      } catch (error) {
        results.set(user.id, { status: "failed", message: getUserMessage(error) });
      }
      setOutcomes(new Map(results));
    }
    setRunning(false);
    setTwoFACode("");
    const done = [...results.values()].filter((r) => r.status === "done").length;
    const failed = [...results.values()].filter((r) => r.status === "failed").length;
    if (failed > 0)
      toast.error(`${spec.label}: ${formatCount(failed)} failed, ${formatCount(done)} done`);
    else toast.success(`${spec.label}: ${formatCount(done)} accounts updated`);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["user"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);
  }

  const processed = outcomes
    ? [...outcomes.values()].filter((o) => o.status !== "skipped").length
    : 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7" disabled={tooMany}>
            Bulk actions
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {(["unsuspend", "unfreeze"] as const).map((id) => (
            <BulkItem key={id} id={id} onSelect={choose} />
          ))}
          <DropdownMenuSeparator />
          {(["suspend", "freeze"] as const).map((id) => (
            <BulkItem key={id} id={id} onSelect={choose} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {tooMany && (
        <span className="text-xs text-muted-foreground">
          Bulk actions apply to at most {BULK_ACTION_LIMIT} customers at a time.
        </span>
      )}

      <Dialog
        open={spec !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {spec && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {spec.label}: {formatCount(batch.length)} customers
              </DialogTitle>
              <DialogDescription>{spec.impact}</DialogDescription>
            </DialogHeader>

            {!outcomes && (
              <div className="grid gap-3 text-sm">
                <p>
                  {formatCount(targets.length)} will be updated.
                  {skipped > 0 &&
                    ` ${formatCount(skipped)} already in that state will be skipped.`}{" "}
                  Each account is changed with its own API call and audit entry.
                </p>
                {spec.needsReason && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="bulk-reason">Reason</Label>
                    <Textarea
                      id="bulk-reason"
                      value={reason}
                      maxLength={500}
                      onChange={(event) => {
                        setReason(event.target.value);
                      }}
                      aria-describedby="bulk-reason-hint"
                    />
                    <p id="bulk-reason-hint" className="text-xs text-muted-foreground">
                      At least {REASON_MIN} characters. Sent to every selected customer and recorded
                      in the audit log.
                    </p>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="bulk-2fa">Authenticator code</Label>
                  <Input
                    id="bulk-2fa"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="max-w-40 font-mono tracking-widest"
                    value={twoFACode}
                    aria-invalid={stepUpError !== null}
                    aria-describedby="bulk-2fa-hint"
                    onChange={(event) => {
                      setTwoFACode(event.target.value);
                      setStepUpError(null);
                    }}
                  />
                  <p id="bulk-2fa-hint" className="text-xs text-muted-foreground">
                    Checked once before the run starts, then reused for the whole batch.
                  </p>
                  {stepUpError !== null && (
                    <p role="alert" className="text-xs text-destructive">
                      {stepUpError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {outcomes && (
              <div className="grid gap-2 text-sm">
                <p role="status" aria-live="polite">
                  {running
                    ? `Processing ${formatCount(processed)} of ${formatCount(targets.length)}…`
                    : `Finished: ${formatCount(processed)} of ${formatCount(targets.length)} processed.`}
                </p>
                <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2">
                  {batch.map((user) => {
                    const outcome = outcomes.get(user.id);
                    return (
                      <li key={user.id} className="flex items-start gap-2">
                        <OutcomeIcon outcome={outcome} running={running} />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate">{userDisplayName(user)}</span>
                          {outcome?.status === "failed" && (
                            <span className="text-xs text-destructive">{outcome.message}</span>
                          )}
                          {outcome?.status === "skipped" && (
                            <span className="text-xs text-muted-foreground">
                              Already in that state
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <DialogFooter>
              {finished ? (
                <Button onClick={close}>Close</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={close}>
                    {running ? "Stop after current" : "Cancel"}
                  </Button>
                  {!outcomes && (
                    <Button
                      variant={spec.needsReason ? "destructive" : "primary"}
                      disabled={!reasonValid || !codeValid || targets.length === 0}
                      onClick={() => void run()}
                    >
                      {spec.label} ({formatCount(targets.length)})
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function BulkItem({ id, onSelect }: { id: BulkActionId; onSelect: (id: BulkActionId) => void }) {
  const spec = BULK_ACTIONS[id];
  const Icon = spec.icon;
  return (
    <DropdownMenuItem
      variant={spec.needsReason ? "destructive" : "default"}
      onSelect={() => {
        onSelect(id);
      }}
    >
      <Icon aria-hidden />
      {spec.label}
    </DropdownMenuItem>
  );
}

function OutcomeIcon({ outcome, running }: { outcome: Outcome | undefined; running: boolean }) {
  if (!outcome) {
    return running ? (
      <LoaderCircleIcon
        className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
        aria-label="Pending"
      />
    ) : (
      <CircleMinusIcon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-label="Not processed"
      />
    );
  }
  if (outcome.status === "done") {
    return <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />;
  }
  if (outcome.status === "failed") {
    return <CircleXIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Failed" />;
  }
  return (
    <CircleMinusIcon
      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      aria-label="Skipped"
    />
  );
}
