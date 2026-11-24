"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Loader2, PencilIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserMessage } from "@/lib/api/errors";

import { updateUserDateOfBirth } from "./api";

interface UpdateDobDialogProps {
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    dateOfBirth?: string | null;
  };
  trigger?: React.ReactNode;
}

export function UpdateDobDialog({ user, trigger }: UpdateDobDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(() => {
    if (user.dateOfBirth) {
      try {
        const d = new Date(user.dateOfBirth);
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 10);
        }
      } catch {}
    }
    return "";
  });
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Customer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateOfBirth.trim()) {
      toast.error("Please enter or select a valid date of birth");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUserDateOfBirth(user.id, dateOfBirth.trim(), reason.trim() || undefined);
      toast.success("Date of birth updated successfully");
      setOpen(false);

      // Invalidate queries so UI refreshes immediately
      void queryClient.invalidateQueries({ queryKey: ["users", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["support", "chat-room"] });
      void queryClient.invalidateQueries({ queryKey: ["support", "chat-rooms"] });
    } catch (error) {
      toast.error(getUserMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <PencilIcon className="h-3 w-3" />
            <span>Edit</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Update Date of Birth
            </DialogTitle>
            <DialogDescription>
              Update the customer&apos;s date of birth for <span className="font-semibold text-foreground">{fullName}</span>.
              This will update both their account profile and verified KYC record.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="dob-input" className="text-xs font-semibold">
                Date of Birth <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dob-input"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                className="w-full"
              />
              <p className="text-[11px] text-muted-foreground">
                Customer must be at least 18 years old. Formats: YYYY-MM-DD or select from calendar.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dob-reason" className="text-xs font-semibold">
                Reason / Note <span className="text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="dob-reason"
                placeholder="e.g. Corrected date per live chat support request"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !dateOfBirth}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

