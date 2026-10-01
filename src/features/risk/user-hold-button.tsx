"use client";

import { LockIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/features/auth/admin-context";

import { PlaceHoldDialog } from "./risk-view";

/** "Place hold" on a customer's page, for administrators with compliance review. */
export function UserHoldButton({ userId, customer }: { userId: string; customer: string }) {
  const canReview = useHasPermission("compliance.review");
  const [open, setOpen] = useState(false);
  if (!canReview) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        <LockIcon aria-hidden />
        Place hold
      </Button>
      <PlaceHoldDialog open={open} onOpenChange={setOpen} userId={userId} customer={customer} />
    </>
  );
}
