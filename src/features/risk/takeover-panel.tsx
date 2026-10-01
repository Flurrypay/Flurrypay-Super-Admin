"use client";

import { useQuery } from "@tanstack/react-query";
import { BanknoteIcon, KeyRoundIcon, SearchIcon, ShieldXIcon, SmartphoneIcon } from "lucide-react";
import { useState } from "react";

import { Amount } from "@/components/format/amount";
import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { humanizeEnum } from "@/lib/format";

import { type AtoTimelineEntry, fetchAccountTakeover } from "./investigation-api";
import { ATO_BAND_ICON, ATO_BAND_TONE } from "./labels";

/**
 * Credential compromise, read as a sequence.
 *
 * Every event in an account takeover is individually normal — people do reset
 * passwords, replace phones and pay new people. What is not normal is the
 * order and the spacing, so this shows the sequence rather than a verdict.
 *
 * The narrative always ends by naming the innocent explanation. A customer who
 * replaced a lost handset produces this exact pattern, and they are the more
 * common case; a panel that did not say so would generate confident wrong
 * conclusions at speed.
 */

const WINDOWS = [6, 24, 72, 168] as const;

const KIND_ICON = {
  SECURITY: KeyRoundIcon,
  DEVICE: SmartphoneIcon,
  MONEY: BanknoteIcon,
  AUTH_FAILURE: ShieldXIcon,
} as const;

const KIND_TONE = {
  SECURITY: "warning",
  DEVICE: "info",
  MONEY: "accent",
  AUTH_FAILURE: "danger",
} as const;

export function TakeoverPanel({ initialUserId }: { initialUserId?: string } = {}) {
  const [userId, setUserId] = useState(initialUserId ?? "");
  const [submitted, setSubmitted] = useState(initialUserId ?? "");
  const [windowHours, setWindowHours] = useState(24);

  const result = useQuery({
    queryKey: ["risk", "ato", submitted, windowHours],
    queryFn: ({ signal }) => fetchAccountTakeover(submitted, windowHours, signal),
    enabled: submitted.length > 0,
  });

  const assessment = result.data;
  const BandIcon = assessment ? (ATO_BAND_ICON[assessment.band] ?? ShieldXIcon) : ShieldXIcon;

  return (
    <div className="grid gap-3 pt-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(userId.trim());
        }}
      >
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="ato-user">Customer id</Label>
          <Input
            id="ato-user"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
            }}
            placeholder="Paste a customer id"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ato-window">Window</Label>
          <Select
            value={String(windowHours)}
            onValueChange={(next) => {
              setWindowHours(Number(next));
            }}
          >
            <SelectTrigger id="ato-window" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((hours) => (
                <SelectItem key={hours} value={String(hours)}>
                  {hours < 48 ? `Last ${hours} hours` : `Last ${Math.round(hours / 24)} days`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={!userId.trim()}>
          <SearchIcon aria-hidden />
          Assess
        </Button>
      </form>

      {!submitted && (
        <EmptyState
          icon={KeyRoundIcon}
          title="Assess an account"
          description="Correlates security events — password resets, new devices, 2FA changes, failed sign-ins — against money leaving, in the order they happened."
        />
      )}

      {submitted && result.isPending && (
        <p className="text-sm text-muted-foreground">Reading the security and money logs…</p>
      )}

      {result.isError && (
        <EmptyState
          icon={ShieldXIcon}
          title="Could not assess this account"
          description="The security log could not be read. Check the customer id and try again."
          action={
            <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {assessment && (
        <>
          <section className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <BandIcon className="size-4 text-muted-foreground" aria-hidden />
                Takeover pattern score
                <span className="tabular-nums">{assessment.score}</span> / 100
              </span>
              <Badge tone={ATO_BAND_TONE[assessment.band] ?? "neutral"}>
                {humanizeEnum(assessment.band)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{assessment.narrative}</p>
          </section>

          {assessment.signals.length > 0 && (
            <section className="grid gap-2">
              <h3 className="text-sm font-medium">Contributing signals</h3>
              <ul className="grid gap-1.5">
                {assessment.signals.map((signal) => (
                  <li
                    key={signal.key}
                    className="grid grid-cols-[3rem_1fr] gap-2 rounded-md border p-2.5"
                  >
                    <span className="text-sm text-muted-foreground tabular-nums">
                      +{signal.points}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-sm">{humanizeEnum(signal.key)}</span>
                      <span className="text-xs text-muted-foreground">{signal.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Sequence</h3>
            {assessment.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No security or money events in this window.
              </p>
            ) : (
              <ol className="grid gap-1">
                {assessment.timeline.map((entry, index) => (
                  <TimelineRow key={`${entry.action}-${index}`} entry={entry} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TimelineRow({ entry }: { entry: AtoTimelineEntry }) {
  const Icon = KIND_ICON[entry.kind];
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums">
        <DateTime value={entry.at} />
      </span>
      <span className="flex-1">{humanizeEnum(entry.action)}</span>
      {entry.amountNaira !== null && (
        <Amount value={entry.amountNaira} currency="NGN" className="tabular-nums" />
      )}
      {entry.ipAddress && (
        <span className="font-mono text-xs text-muted-foreground">{entry.ipAddress}</span>
      )}
      <Badge tone={KIND_TONE[entry.kind]}>{humanizeEnum(entry.kind)}</Badge>
    </li>
  );
}
