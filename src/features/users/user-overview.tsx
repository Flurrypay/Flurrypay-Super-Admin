"use client";

import Link from "next/link";

import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { Badge } from "@/components/ui/badge";

import type { UserDetail } from "./api";

function Check({ value, label }: { value: boolean; label: string }) {
  return (
    <Badge tone={value ? "success" : "neutral"}>
      {value ? label : `No ${label.toLowerCase()}`}
    </Badge>
  );
}

function lockedUntil(value: string | null): string | null {
  return value && new Date(value) > new Date() ? value : null;
}

export function UserOverview({ user }: { user: UserDetail }) {
  const loginLock = lockedUntil(user.loginLockedUntil);
  const pinLock = lockedUntil(user.pinLockedUntil);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DetailSection title="Profile">
        <DetailList
          items={[
            { label: "Full name", value: `${user.firstName} ${user.lastName}`.trim() },
            { label: "Username", value: user.userName ? `@${user.userName}` : null },
            { label: "Email", value: user.email },
            {
              label: "Phone",
              value: user.phoneNumber ? (
                <span className="font-mono text-xs">{user.phoneNumber}</span>
              ) : null,
            },
            { label: "Country", value: user.country },
            { label: "Date of birth", value: user.dateOfBirth },
            { label: "Joined", value: <DateTime value={user.createdAt} /> },
            { label: "User ID", value: <Identifier value={user.id} label="user ID" /> },
          ]}
        />
      </DetailSection>

      <DetailSection title="Balances" description="As recorded on the account.">
        <DetailList
          items={[
            {
              label: "Naira wallet",
              value: <Amount value={user.walletBalance} currency="NGN" className="text-base" />,
            },
            {
              label: "Referral balance",
              value: <Amount value={user.referralBalance} currency="NGN" />,
            },
            { label: "Welcome bonus", value: <Amount value={user.welcomeBonus} currency="NGN" /> },
            {
              label: "Completed transactions",
              value: <span className="tabular-nums">{user.transactionCount}</span>,
            },
          ]}
        />
        {user.bankDetails.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Deposit account</p>
            {user.bankDetails.map((bank) => (
              <DetailList
                key={bank.accountNumber}
                items={[
                  { label: "Bank", value: bank.bankName },
                  {
                    label: "Account number",
                    value: <Identifier value={bank.accountNumber} label="account number" />,
                  },
                  { label: "Account name", value: bank.accountName },
                ]}
              />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Access & restrictions">
        <DetailList
          items={[
            { label: "Last sign-in", value: <DateTime value={user.lastLogin} /> },
            {
              label: "Last sign-in IP",
              value: user.lastLoginIp ? (
                <span className="font-mono text-xs">{user.lastLoginIp}</span>
              ) : null,
            },
            { label: "Sign-ins", value: <span className="tabular-nums">{user.loginCount}</span> },
            {
              label: "Blocked",
              value: user.isBlocked ? (
                <span>
                  Yes
                  {user.blockedAt && (
                    <>
                      {" "}
                      · <DateTime value={user.blockedAt} />
                    </>
                  )}
                  {user.reasonForBlock && (
                    <span className="block text-xs text-muted-foreground">
                      {user.reasonForBlock.replace(/_/g, " ")}
                    </span>
                  )}
                </span>
              ) : (
                "No"
              ),
            },
            {
              label: "Suspended",
              value: user.isSuspended ? (
                <span>
                  Yes
                  {user.suspendedAt && (
                    <>
                      {" "}
                      · <DateTime value={user.suspendedAt} />
                    </>
                  )}
                  {user.suspensionReason && (
                    <span className="block text-xs text-muted-foreground">
                      {user.suspensionReason}
                    </span>
                  )}
                </span>
              ) : (
                "No"
              ),
            },
            {
              label: "Outbound frozen",
              value: user.outboundRestricted ? (
                <span>
                  Yes
                  {user.outboundRestrictedAt && (
                    <>
                      {" "}
                      · <DateTime value={user.outboundRestrictedAt} />
                    </>
                  )}
                  {user.outboundRestrictedReason && (
                    <span className="block text-xs text-muted-foreground">
                      {user.outboundRestrictedReason}
                    </span>
                  )}
                </span>
              ) : (
                "No"
              ),
            },
            {
              label: "Sign-in lock",
              value: loginLock ? (
                <>
                  Until <DateTime value={loginLock} />
                </>
              ) : (
                `None (${user.loginAttempts} failed attempts)`
              ),
            },
            {
              label: "PIN lock",
              value: pinLock ? (
                <>
                  Until <DateTime value={pinLock} />
                </>
              ) : (
                `None (${user.pinAttempts} failed attempts)`
              ),
            },
          ]}
        />
      </DetailSection>

      <DetailSection title="Verification">
        <div className="flex flex-wrap gap-1.5">
          <Check value={user.isConfirmed} label="Email confirmed" />
          <Check value={user.hasVerifiedBVN} label="BVN verified" />
          <Check value={user.hasVerifiedNIN} label="NIN verified" />
          <Check value={user.hasVerifiedAddress} label="Address verified" />
          <Check value={user.hasVerifiedLiveness} label="Liveness passed" />
          <Check value={user.hasActivated2FA} label="2FA enabled" />
        </div>
        <DetailList
          className="mt-3"
          items={[
            { label: "KYC level", value: <span className="tabular-nums">{user.level}</span> },
            {
              label: "Government ID",
              value: user.hasVerifiedGovernmentId?.replace(/[-_]/g, " ").toLowerCase(),
            },
            {
              label: "Referral code",
              value: user.referralCode ? (
                <span className="font-mono text-xs">{user.referralCode}</span>
              ) : null,
            },
            {
              label: "Referred by",
              value: user.referredById ? (
                <Link href={`/users/${user.referredById}`} className="hover:underline">
                  View referrer
                </Link>
              ) : null,
            },
          ]}
        />
      </DetailSection>
    </div>
  );
}
