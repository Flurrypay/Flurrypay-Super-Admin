"use client";

import { FlagIcon, ScaleIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react";
import Link from "next/link";

import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { Identifier } from "@/components/format/identifier";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum } from "@/lib/format";

import { isFlagged, type Transaction } from "./api";
import { TransactionType } from "./columns";
import { flagReasonLabel, flagSeverityLabel, flagSeverityTone, TRANSACTION_STATUS } from "./labels";

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

  const flagOpen = isFlagged(tx);
  const severityLabel = flagSeverityLabel(tx.flagSeverity);

  return (
    <div className="grid gap-4">
      {/*
        Above the failure banner: a flag is the thing an admin opening this
        transaction most needs to know first, because it means somebody else is
        already looking and acting again would be duplicated work.
      */}
      {flagOpen && (
        <Alert
          tone={tx.flagSeverity === "CRITICAL" || tx.flagSeverity === "HIGH" ? "danger" : "warning"}
        >
          <FlagIcon aria-hidden />
          <AlertTitle className="flex flex-wrap items-center gap-2">
            Flagged for review
            {tx.flagReason && <span>— {flagReasonLabel(tx.flagReason)}</span>}
            {severityLabel && (
              <Badge tone={flagSeverityTone(tx.flagSeverity)}>{severityLabel}</Badge>
            )}
          </AlertTitle>
          <AlertDescription className="grid gap-1">
            {tx.flagNote && <span className="whitespace-pre-wrap">{tx.flagNote}</span>}
            <span className="text-xs">
              Raised <DateTime value={tx.flaggedAt} format="relative" />. The customer is not shown
              this, and nothing is held.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {!flagOpen && tx.flagClearedAt && (
        <Alert tone="neutral">
          <FlagIcon aria-hidden />
          <AlertTitle>Flag cleared</AlertTitle>
          <AlertDescription className="grid gap-1">
            {tx.flagResolution && <span className="whitespace-pre-wrap">{tx.flagResolution}</span>}
            <span className="text-xs">
              Flagged <DateTime value={tx.flaggedAt} format="relative" />, cleared{" "}
              <DateTime value={tx.flagClearedAt} format="relative" />.
            </span>
          </AlertDescription>
        </Alert>
      )}

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

      <WalletMovementSection tx={tx} />

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

/**
 * What this transaction did to the customer's naira balance.
 *
 * The question support actually opens a transaction to answer is "their
 * balance is X, why?" — and an amount on its own never answers it. The ledger
 * does: each entry carries the balance either side of it, captured inside the
 * same locked database transaction as the change itself.
 *
 * Several entries under one reference is normal, not an anomaly: a withdrawal
 * debits the principal and the fee separately. They are listed in order so the
 * arithmetic is visible rather than asserted.
 */
function WalletMovementSection({ tx }: { tx: Transaction }) {
  const movement = tx.walletMovement;

  if (!movement) {
    return (
      <DetailSection title="Naira wallet">
        <p className="text-sm text-muted-foreground">
          {/*
            Deliberately not "₦0". This transaction has no matching ledger
            entry, which usually means it never touched the naira wallet — a
            crypto-to-crypto send, say. It can also mean the movement predates
            the ledger, or bypassed it. Those are different from a zero.
          */}
          No naira movement is recorded against this reference. Either the transaction did not touch
          the naira wallet, or it predates the wallet ledger.
        </p>
      </DetailSection>
    );
  }

  const credit = Number(movement.netChange) >= 0;

  return (
    <DetailSection title="Naira wallet">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-md border bg-muted/30 px-3 py-2.5">
          <span className="grid leading-tight">
            <span className="text-xs text-muted-foreground">Balance before</span>
            <Amount value={movement.balanceBefore} currency="NGN" />
          </span>
          <span className="grid leading-tight">
            <span className="text-xs text-muted-foreground">Change</span>
            <span className={credit ? "text-success" : "text-foreground"}>
              {credit ? "+" : ""}
              <Amount value={movement.netChange} currency="NGN" />
            </span>
          </span>
          <span className="grid leading-tight">
            <span className="text-xs text-muted-foreground">Balance after</span>
            <Amount value={movement.balanceAfter} currency="NGN" className="font-semibold" />
          </span>
        </div>

        {movement.hasGap && (
          <Alert tone="warning">
            <ScaleIcon aria-hidden />
            <AlertTitle>These entries do not join up</AlertTitle>
            <AlertDescription>
              One entry&apos;s closing balance is not the next one&apos;s opening balance, so
              something changed this customer&apos;s balance in between. That is either another
              transaction interleaving, or a movement that never reached the ledger — worth checking
              which.
            </AlertDescription>
          </Alert>
        )}

        {movement.entries.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {movement.entries.length} movements under this reference — a transaction and its fee are
            recorded separately.
          </p>
        )}

        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm" aria-label="Wallet ledger entries">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Source
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Before
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  After
                </th>
              </tr>
            </thead>
            <tbody>
              {movement.entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="px-3 py-2">
                    <span className="grid leading-tight">
                      <span>{entry.source}</span>
                      {entry.narration && (
                        <span className="max-w-72 truncate text-xs text-muted-foreground">
                          {entry.narration}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        <DateTime value={entry.createdAt} />
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                    <Amount value={entry.balanceBefore} currency="NGN" className="font-normal" />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {/*
                      The sign comes from `direction`; the stored amount is
                      always positive. Spelled out for assistive tech rather
                      than left to a glyph and a colour.
                    */}
                    <span
                      className={entry.direction === "CREDIT" ? "text-success" : "text-foreground"}
                    >
                      {entry.direction === "CREDIT" ? "+" : "\u2212"}
                      <Amount value={entry.amountNaira} currency="NGN" />
                      <span className="sr-only">
                        {entry.direction === "CREDIT" ? " credit" : " debit"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Amount value={entry.balanceAfter} currency="NGN" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DetailSection>
  );
}
