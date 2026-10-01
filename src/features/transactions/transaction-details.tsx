"use client";

import { TriangleAlertIcon, Undo2Icon } from "lucide-react";
import Link from "next/link";

import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { humanizeEnum } from "@/lib/format";

import type { Transaction } from "./api";
import { TransactionType } from "./columns";
import { TRANSACTION_STATUS } from "./labels";

/** Everything the ledger records about one transaction, grouped by concern. */
export function TransactionDetails({
  tx,
  canViewUsers,
}: {
  tx: Transaction;
  canViewUsers: boolean;
}) {
  const customer = tx.user
    ? `${tx.user.firstName} ${tx.user.lastName}`.trim() || tx.user.email
    : null;
  const hasExchange = Boolean(tx.fromCurrency || tx.toCurrency || tx.exchangeRate);
  const hasChain = Boolean(
    tx.transactionHash || tx.walletAddress || tx.recipientAddress || tx.senderAddress,
  );
  const hasBill = Boolean(tx.phoneNumber || tx.meterNumber || tx.customerName);

  return (
    <div className="grid gap-4">
      {tx.status === "FAILED" && (
        <Alert tone="danger">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>{tx.failureReason ?? "Failed without a recorded reason"}</AlertTitle>
          <AlertDescription>
            {tx.failureOurFault === true && "Recorded as a platform-side failure. "}
            {tx.failureOurFault === false && "Recorded as a customer or provider-side failure. "}
            {tx.reversedAt
              ? "Funds have been returned."
              : "No reversal is recorded for this transaction."}
          </AlertDescription>
        </Alert>
      )}

      <DetailSection title="Summary">
        <DetailList
          items={[
            {
              label: "Amount",
              value: <Amount value={tx.amount} currency={tx.currency} className="text-base" />,
            },
            {
              label: "Status",
              value: <StatusBadge status={resolveStatus(TRANSACTION_STATUS, tx.status)} />,
            },
            { label: "Type", value: <TransactionType type={tx.transactionType} /> },
            {
              label: "Fee",
              value: (
                <Amount
                  value={tx.fee}
                  currency={tx.feeCurrency ?? tx.currency}
                  className="font-normal"
                />
              ),
            },
            { label: "Description", value: tx.description ?? tx.title, hideWhenEmpty: true },
            { label: "Created", value: <DateTime value={tx.createdAt} /> },
            { label: "Last updated", value: <DateTime value={tx.updatedAt} /> },
          ]}
        />
      </DetailSection>

      <DetailSection title="Customer">
        <DetailList
          items={[
            {
              label: "Name",
              value:
                customer && tx.user ? (
                  canViewUsers ? (
                    <Link href={`/users/${tx.user.id}`} className="font-medium hover:underline">
                      {customer}
                    </Link>
                  ) : (
                    customer
                  )
                ) : null,
            },
            { label: "Email", value: tx.user?.email },
            { label: "User ID", value: <Identifier value={tx.userId} truncate label="user ID" /> },
          ]}
        />
      </DetailSection>

      {hasExchange && (
        <DetailSection title="Exchange">
          <DetailList
            items={[
              { label: "From", value: <Amount value={tx.fromAmount} currency={tx.fromCurrency} /> },
              { label: "To", value: <Amount value={tx.toAmount} currency={tx.toCurrency} /> },
              {
                label: "Rate",
                value: tx.exchangeRate,
                hint: "Rate recorded on the transaction, as stored.",
              },
            ]}
          />
        </DetailSection>
      )}

      {hasChain && (
        <DetailSection title="Blockchain">
          <DetailList
            items={[
              { label: "Network", value: tx.network },
              {
                label: "Transaction hash",
                value: <Identifier value={tx.transactionHash} truncate label="transaction hash" />,
              },
              {
                label: "Wallet address",
                value: <Identifier value={tx.walletAddress} truncate label="wallet address" />,
                hideWhenEmpty: true,
              },
              {
                label: "Sender",
                value: <Identifier value={tx.senderAddress} truncate label="sender address" />,
                hideWhenEmpty: true,
              },
              {
                label: "Recipient",
                value: (
                  <Identifier value={tx.recipientAddress} truncate label="recipient address" />
                ),
                hideWhenEmpty: true,
              },
            ]}
          />
        </DetailSection>
      )}

      {hasBill && (
        <DetailSection title="Bill payment">
          <DetailList
            items={[
              { label: "Phone number", value: tx.phoneNumber, hideWhenEmpty: true },
              { label: "Meter number", value: tx.meterNumber, hideWhenEmpty: true },
              { label: "Customer name", value: tx.customerName, hideWhenEmpty: true },
            ]}
          />
        </DetailSection>
      )}

      {tx.reversedAt && (
        <DetailSection title="Reversal">
          <div className="mb-2 flex items-center gap-1.5 text-sm text-warning">
            <Undo2Icon className="size-4" aria-hidden />
            Funds were returned to the customer.
          </div>
          <DetailList
            items={[
              { label: "Reversed", value: <DateTime value={tx.reversedAt} /> },
              {
                label: "Amount returned",
                value: <Amount value={tx.reversedAmount} currency={tx.currency} />,
              },
              { label: "Reason", value: tx.reversalReason },
              {
                label: "By administrator",
                value: (
                  <Identifier value={tx.reversedByAdminId} truncate label="administrator ID" />
                ),
              },
            ]}
          />
        </DetailSection>
      )}

      {(tx.failureCode || tx.failureReason) && tx.status !== "FAILED" && (
        <DetailSection title="Failure history">
          <DetailList
            items={[
              { label: "Reason", value: tx.failureReason },
              { label: "Code", value: tx.failureCode ? humanizeEnum(tx.failureCode) : null },
            ]}
          />
        </DetailSection>
      )}

      <DetailSection title="Identifiers">
        <DetailList
          items={[
            { label: "Reference", value: <Identifier value={tx.reference} label="reference" /> },
            { label: "Provider", value: tx.provider },
            {
              label: "Provider reference",
              value: <Identifier value={tx.externalId} label="provider reference" />,
            },
            {
              label: "Failure code",
              value: tx.failureCode ? (
                <span className="font-mono text-xs">{tx.failureCode}</span>
              ) : null,
              hideWhenEmpty: true,
            },
            { label: "Internal ID", value: <Identifier value={tx.id} label="internal ID" /> },
          ]}
        />
      </DetailSection>
    </div>
  );
}
