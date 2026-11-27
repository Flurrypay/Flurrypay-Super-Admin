"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  CopyIcon,
  GiftIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Metric } from "@/features/overview/metric";

import { fetchUserReferrals, type ReferredFriend } from "./api";

export function UserReferrals({ userId }: { userId: string }) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const result = useQuery({
    queryKey: ["user-referrals", userId],
    queryFn: ({ signal }) => fetchUserReferrals(userId, signal),
  });

  if (result.isPending) return <Skeleton className="h-64" />;
  if (result.isError) {
    return (
      <ErrorState
        error={result.error}
        subject="referral summary"
        onRetry={() => void result.refetch()}
      />
    );
  }

  const data = result.data;
  const referralCode = data.referralCode || "N/A";
  const referralLink = data.referralCode
    ? `https://flurrypay.io/register?ref=${data.referralCode}`
    : "";

  const handleCopy = () => {
    if (!referralLink) return;
    void navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard");
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const filteredReferrals = data.referrals.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = `${r.referredFirstName} ${r.referredLastName}`.toLowerCase();
    const email = (r.referredEmail || "").toLowerCase();
    const phone = (r.referredPhoneNumber || "").toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });

  return (
    <div className="grid gap-4">
      {/* Top Banner: Referral Code & Link */}
      <div className="flex flex-col gap-3 rounded-xl border bg-gradient-to-r from-card to-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GiftIcon className="size-4 text-primary" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Customer Referral Link & Code</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Code: <span className="font-mono font-bold text-foreground">{referralCode}</span>
            {referralLink && (
              <span className="ml-2 hidden font-mono text-[11px] text-muted-foreground sm:inline">
                ({referralLink})
              </span>
            )}
          </p>
        </div>
        {data.referralCode && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 self-start text-xs sm:self-auto"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <CheckIcon className="size-3.5 text-success" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" />
                Copy Link
              </>
            )}
          </Button>
        )}
      </div>

      {/* Referral KPI Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Total Invited"
          value={data.referrals.length}
          icon={UsersIcon}
          definition={`${data.pendingFriendsCount} pending verification`}
          isPending={false}
          isError={false}
        />
        <Metric
          label="Active Traders"
          value={data.activeFriendsCount}
          icon={UserCheckIcon}
          definition="Friends who completed qualifying trades"
          isPending={false}
          isError={false}
        />
        <Metric
          label="Total Earned"
          value={Number(data.lifetimeEarnedNaira || 0)}
          display={
            <Amount value={data.lifetimeEarnedNaira} currency="NGN" className="font-semibold" />
          }
          icon={TrendingUpIcon}
          definition="Lifetime commission earned from referred users"
          isPending={false}
          isError={false}
        />
        <Metric
          label="Pending Bonus"
          value={Number(data.pendingReferralBonusNaira || 0)}
          display={
            <Amount
              value={data.pendingReferralBonusNaira}
              currency="NGN"
              className="font-semibold"
            />
          }
          icon={SparklesIcon}
          definition="Awaiting qualifying trade"
          isPending={false}
          isError={false}
        />
      </div>

      {/* Welcome Bonus Status if present */}
      {data.welcomeBonus && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Welcome Signup Bonus:{" "}
            <span className="font-medium text-foreground">
              <Amount value={data.welcomeBonus.amountNaira} currency="NGN" />
            </span>{" "}
            ({data.welcomeBonus.status})
          </span>
          {data.welcomeBonus.referrerName && (
            <span className="text-muted-foreground">
              Referred by:{" "}
              <Link
                href={`/users/${data.welcomeBonus.referrerId}`}
                className="font-medium text-primary hover:underline"
              >
                {data.welcomeBonus.referrerName}
              </Link>
            </span>
          )}
        </div>
      )}

      {/* Referred Friends Section */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Referred Friends ({data.referrals.length})</h4>
            <Freshness
              updatedAt={result.dataUpdatedAt}
              isFetching={result.isFetching}
              onRefresh={() => void result.refetch()}
            />
          </div>
          <div className="relative w-full max-w-xs">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter friends by name, email, phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {filteredReferrals.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No referrals found"
            description={
              search ? "No friends match your filter." : "This customer hasn't referred anyone yet."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="py-2.5 pr-2 pl-3 text-left font-semibold">Customer</th>
                  <th className="px-2 py-2.5 text-left font-semibold">KYC Level</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Joined</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Trades</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Trade Volume</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Earned</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Status</th>
                  <th className="py-2.5 pr-3 pl-2 text-right font-semibold">Rewards</th>
                </tr>
              </thead>
              <tbody className="divide-y text-foreground">
                {filteredReferrals.map((friend) => (
                  <FriendRow key={friend.referredUserId} friend={friend} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FriendRow({ friend }: { friend: ReferredFriend }) {
  const fullName =
    `${friend.referredFirstName} ${friend.referredLastName}`.trim() || friend.referredEmail;
  const isExpired = friend.windowStatus === "EXPIRED";
  const isActive = friend.windowStatus === "ACTIVE";

  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="py-2 pr-2 pl-3">
        <Link
          href={`/users/${friend.referredUserId}`}
          className="group grid leading-tight hover:underline"
        >
          <span className="font-medium group-hover:text-primary">{fullName}</span>
          <span className="text-[11px] text-muted-foreground">{friend.referredEmail}</span>
        </Link>
      </td>
      <td className="px-2 py-2">
        <Badge tone={friend.referredLevel > 0 ? "success" : "neutral"} className="py-0 text-[10px]">
          Level {friend.referredLevel}
        </Badge>
      </td>
      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
        <DateTime value={friend.createdAt} format="date" />
      </td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">
        {friend.revenueShareTradesCount}
      </td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">
        <Amount value={friend.qualifyingVolumeNaira || "0"} currency="NGN" />
      </td>
      <td className="px-2 py-2 text-right font-mono font-medium text-primary tabular-nums">
        <Amount value={friend.lifetimeEarnedNaira || "0"} currency="NGN" />
      </td>
      <td className="px-2 py-2">
        <div className="grid leading-tight">
          <Badge
            tone={isActive ? "success" : isExpired ? "neutral" : "warning"}
            className="w-fit py-0 text-[10px]"
          >
            {friend.windowStatus}
          </Badge>
          {isActive && (
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {friend.daysRemaining}d left
            </span>
          )}
        </div>
      </td>
      <td className="py-2 pr-3 pl-2 text-right">
        {friend.rewards.length > 0 ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-primary">
                {friend.rewards.length} rewards
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm font-semibold">Rewards from {fullName}</DialogTitle>
              </DialogHeader>
              <div className="max-h-80 space-y-2 overflow-y-auto py-2">
                {friend.rewards.map((rw) => (
                  <div
                    key={rw.id}
                    className="flex items-center justify-between rounded border bg-muted/20 p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium text-foreground">{rw.type}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Day {rw.dayNumber} · <DateTime value={rw.creditedAt} />
                      </p>
                    </div>
                    <span className="font-mono font-bold text-success">
                      +<Amount value={rw.amountNaira} currency="NGN" />
                    </span>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}
