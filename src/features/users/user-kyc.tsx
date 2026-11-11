"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { approveKycLevel, fetchUserKyc, type KycLevel, rejectKycLevel } from "@/features/kyc/api";

/** UI for a single KYC level – shows current status and lets an admin approve / reject. */
export function UserKyc({ userId, name }: { userId: string; name: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["kyc", userId],
    queryFn: ({ signal }) => fetchUserKyc(userId, signal),
  });
  const queryClient = useQueryClient();

  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [twoFA, setTwoFA] = useState("");

  const approve = useMutation({
    mutationFn: (lvl: KycLevel) => approveKycLevel(userId, lvl, twoFA),
    onSuccess: () => {
      toast.success(`KYC level approved for ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["kyc", userId] });
      setOpen(null);
    },
  });

  const reject = useMutation({
    mutationFn: (lvl: KycLevel) => rejectKycLevel(userId, lvl, reason, twoFA),
    onSuccess: () => {
      toast.success(`KYC level rejected for ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["kyc", userId] });
      setOpen(null);
    },
  });

  if (isLoading) return <Skeleton className="h-8 w-48" />;
  if (isError) return <ErrorState subject="KYC information" error={error} />;

  const kycProfile = data?.profile ?? null;
  const userInfo = kycProfile?.user ?? null;
  const level = kycProfile?.currentLevel ?? 0;
  const targetLevel: KycLevel = level === 1 || level === 2 || level === 3 ? level : 3;
  const canApprove = Boolean(kycProfile?.review?.canApprove ?? kycProfile?.level3.canApprove);

  return (
    <div className="grid gap-4">
      <h3 className="text-lg font-semibold">KYC – Level {level}</h3>
      <p>
        {userInfo?.firstName ?? ""} {userInfo?.lastName ?? ""} – {userInfo?.email ?? ""}
      </p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={() => {
            setOpen("approve");
          }}
          disabled={!canApprove}
        >
          Approve
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            setOpen("reject");
          }}
          disabled={!canApprove}
        >
          Reject
        </Button>
      </div>

      {/* ---------- Modal used for both approve & reject ---------- */}
      <Dialog
        open={open !== null}
        onOpenChange={() => {
          setOpen(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open === "approve" ? "Approve KYC" : "Reject KYC"}</DialogTitle>
          </DialogHeader>
          {open === "reject" && (
            <Textarea
              placeholder="Reason for rejection (required)"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          )}
          <Input
            placeholder="2‑FA code"
            value={twoFA}
            onChange={(e) => {
              setTwoFA(e.target.value);
            }}
          />
          <DialogFooter className="flex justify-end">
            <Button
              variant={open === "reject" ? "destructive" : "primary"}
              disabled={open === "reject" && reason.trim().length < 10}
              onClick={() => {
                if (open === "approve") approve.mutate(targetLevel);
                else reject.mutate(targetLevel);
              }}
            >
              {open === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
