"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { Amount } from "@/components/format/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdmin } from "@/features/auth/admin-context";
import { hasPermission } from "@/features/auth/permissions";
import {
  checkProviderStatus,
  markStrandedDelivered,
  refundStranded,
} from "@/features/operations/api";

interface ResolvePendingDialogProps {
  reference: string;
  amount?: number | string | null;
  customerName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ResolvePendingDialog({
  reference,
  amount,
  customerName,
  open,
  onOpenChange,
  onSuccess,
}: ResolvePendingDialogProps) {
  const admin = useAdmin();
  const queryClient = useQueryClient();

  const canResolve =
    hasPermission(admin, "wallets.withdraw") ||
    hasPermission(admin, "transactions.reverse") ||
    admin.role === "executive";

  const [confirmAction, setConfirmAction] = useState<"refund" | "delivered" | null>(null);

  const statusQuery = useQuery({
    queryKey: ["provider-status", reference],
    queryFn: ({ signal }) => checkProviderStatus(reference, signal),
    enabled: open && Boolean(reference),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const providerData = statusQuery.data;

  const refundMutation = useMutation({
    mutationFn: async ({ note, twoFACode }: { note: string; twoFACode: string }) => {
      return refundStranded(reference, { note, twoFACode });
    },
    onSuccess: async (data) => {
      toast.success(data.message || "Transaction refunded to customer wallet (amount + fee).");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transaction", reference] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["stranded"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
      setConfirmAction(null);
      onOpenChange(false);
      onSuccess?.();
    },
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ note, twoFACode }: { note: string; twoFACode: string }) => {
      return markStrandedDelivered(reference, { note, twoFACode });
    },
    onSuccess: async (data) => {
      toast.success(data.message || "Transaction marked as delivered.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transaction", reference] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["stranded"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
      setConfirmAction(null);
      onOpenChange(false);
      onSuccess?.();
    },
  });

  const getStatusBadge = (statusStr: string) => {
    const s = statusStr.toUpperCase();
    if (s === "SUCCESS" || s === "COMPLETED") {
      return (
        <Badge tone="success" className="gap-1 font-semibold">
          <CheckCircle2Icon className="size-3.5" />
          DELIVERED ON SWITCH
        </Badge>
      );
    }
    if (s === "FAILED" || s === "NOT_FOUND" || s === "REVERSED") {
      return (
        <Badge tone="danger" className="gap-1 font-semibold">
          <XCircleIcon className="size-3.5" />
          {s === "NOT_FOUND" ? "NOT SENT (NOT ON SWITCH)" : "FAILED ON SWITCH"}
        </Badge>
      );
    }
    return (
      <Badge tone="warning" className="gap-1 font-semibold">
        <AlertCircleIcon className="size-3.5" />
        {s || "PENDING SWITCH VERIFICATION"}
      </Badge>
    );
  };

  return (
    <>
      <Dialog open={open && confirmAction === null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCwIcon className="size-5 text-primary" />
              Resolve Pending Transaction
            </DialogTitle>
            <DialogDescription>
              Verify payout ground truth directly with the payout provider switch and resolve this
              transfer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Transaction overview pill */}
            <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Reference:</span>
                <span className="font-semibold text-foreground select-all">{reference}</span>
              </div>
              {amount != null && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Amount:</span>
                  <span className="font-semibold text-foreground">
                    <Amount value={amount} currency="NGN" />
                  </span>
                </div>
              )}
              {customerName && (
                <div className="flex items-center justify-between font-sans text-muted-foreground">
                  <span>Customer:</span>
                  <span className="font-medium text-foreground">{customerName}</span>
                </div>
              )}
            </div>

            {/* Provider Switch Verification Box */}
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheckIcon className="size-4 text-primary" />
                  Provider Switch Ground Truth
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={statusQuery.isFetching}
                  onClick={() => void statusQuery.refetch()}
                  className="h-7 gap-1 text-xs"
                >
                  <RefreshCwIcon
                    className={`size-3 ${statusQuery.isFetching ? "animate-spin" : ""}`}
                  />
                  {statusQuery.isFetching ? "Checking..." : "Recheck"}
                </Button>
              </div>

              {statusQuery.isPending ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                  Querying live payout switch status...
                </div>
              ) : statusQuery.isError ? (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <span className="font-semibold">Failed to query provider:</span>
                    <p className="mt-0.5 opacity-90">{statusQuery.error.message}</p>
                  </div>
                </div>
              ) : providerData ? (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-background/80 p-2.5">
                      <span className="block text-[11px] text-muted-foreground">
                        Payout Provider
                      </span>
                      <span className="font-bold text-foreground uppercase">
                        {providerData.provider || "Nomba"}
                      </span>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-2.5">
                      <span className="block text-[11px] text-muted-foreground">Switch Status</span>
                      <div className="mt-1">{getStatusBadge(providerData.providerStatus)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-background/80 px-3 py-2">
                    <span className="text-muted-foreground">Settlement Float Debited:</span>
                    <span
                      className={`font-semibold ${
                        providerData.settlementDebited ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {providerData.settlementDebited ? "Yes (Deducted)" : "No (Untouched)"}
                    </span>
                  </div>

                  {providerData.destination && (
                    <div className="space-y-0.5 rounded-lg border bg-background/80 px-3 py-2">
                      <span className="block text-[11px] text-muted-foreground">Destination:</span>
                      <div className="font-medium">
                        {providerData.destination.bankName || "Bank"}{" "}
                        <span className="font-mono text-muted-foreground">
                          {providerData.destination.accountNumber}
                        </span>
                      </div>
                      {providerData.destination.accountName && (
                        <div className="text-[11px] text-muted-foreground">
                          {providerData.destination.accountName}
                        </div>
                      )}
                    </div>
                  )}

                  {providerData.providerMessage && (
                    <div className="rounded-lg border bg-background/80 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="mb-0.5 block font-semibold text-foreground">
                        Provider Message:
                      </span>
                      {providerData.providerMessage}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No status received from provider switch.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 border-t pt-2 sm:flex-row">
            {canResolve && (
              <>
                <Button
                  variant="destructive"
                  className="gap-1.5 sm:flex-1"
                  onClick={() => {
                    setConfirmAction("refund");
                  }}
                >
                  <RotateCcwIcon className="size-4" />
                  Refund to Customer Wallet
                </Button>

                <Button
                  variant="outline"
                  className="gap-1.5 sm:flex-1"
                  onClick={() => {
                    setConfirmAction("delivered");
                  }}
                >
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                  Mark Delivered
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Step-up with 2FA for Refund */}
      <ConfirmActionDialog
        open={confirmAction === "refund"}
        onOpenChange={(next) => {
          if (!next) setConfirmAction(null);
        }}
        title="Refund Transfer to Customer Wallet"
        target={
          <span className="font-mono font-semibold">
            {reference} ({amount ? <Amount value={amount} currency="NGN" /> : "Transfer"})
          </span>
        }
        impact="Both the principal amount and the transaction fee deducted when initiating this transfer will be returned to the customer's wallet balance. Use this after verifying on the provider switch that money was not delivered."
        confirmLabel="Refund Amount & Fee"
        tone="danger"
        reason={{
          required: true,
          minLength: 5,
          label: "Reason for refund",
          hint: "e.g. Verified switch failure, provider status NOT_FOUND",
        }}
        stepUp={{ twoFactor: true }}
        onConfirm={async (values) => {
          await refundMutation.mutateAsync({
            note: values.reason,
            twoFACode: values.twoFACode ?? "",
          });
        }}
      />

      {/* Confirmation Step-up with 2FA for Mark Delivered */}
      <ConfirmActionDialog
        open={confirmAction === "delivered"}
        onOpenChange={(next) => {
          if (!next) setConfirmAction(null);
        }}
        title="Mark Transfer as Delivered"
        target={<span className="font-mono font-semibold">{reference}</span>}
        impact="Records that the provider switch did deliver the payout to the recipient bank. The transaction status is updated to COMPLETED and no funds are moved."
        confirmLabel="Confirm Delivered"
        reason={{
          required: true,
          minLength: 5,
          label: "Confirmation reference",
          hint: "e.g. Verified session ID on Nomba portal, bank credit slip confirmed",
        }}
        stepUp={{ twoFactor: true }}
        onConfirm={async (values) => {
          await markDeliveredMutation.mutateAsync({
            note: values.reason,
            twoFACode: values.twoFACode ?? "",
          });
        }}
      />
    </>
  );
}
