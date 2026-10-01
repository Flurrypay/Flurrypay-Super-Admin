"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, FileWarningIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getUserMessage } from "@/lib/api/errors";

import { resolveDocumentUrl } from "./api";

const DISPLAYABLE = /^(https:\/\/|data:image\/|private:)/;

/**
 * Shows a KYC document. Private files get a short-lived signed URL (5 minutes),
 * fetched on view and never cached beyond it.
 */
export function KycDocument({ location, label }: { location: string | null; label: string }) {
  const displayable = Boolean(location && DISPLAYABLE.test(location));
  const url = useQuery({
    queryKey: ["kyc-document", location],
    queryFn: () => resolveDocumentUrl(location ?? ""),
    enabled: displayable,
    staleTime: 4 * 60_000,
    gcTime: 4 * 60_000,
  });

  if (!location) {
    return <p className="text-sm text-muted-foreground">Not submitted.</p>;
  }
  if (!displayable) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <FileWarningIcon className="size-4" aria-hidden />
        Stored in a format this console cannot display.
      </p>
    );
  }
  if (url.isPending) return <Skeleton className="h-40 w-full max-w-72" />;
  if (url.isError) return <p className="text-sm text-destructive">{getUserMessage(url.error)}</p>;

  const isPdf = /\.pdf(\?|$)/i.test(location);
  return (
    <figure className="grid gap-1.5">
      {isPdf ? (
        <a
          href={url.data}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-sm underline"
        >
          <ExternalLinkIcon className="size-4" aria-hidden />
          Open {label} (PDF)
        </a>
      ) : (
        <a href={url.data} target="_blank" rel="noreferrer noopener" className="block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from the API */}
          <img
            src={url.data}
            alt={label}
            referrerPolicy="no-referrer"
            className="max-h-56 max-w-72 rounded-md border bg-muted object-contain"
          />
        </a>
      )}
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}
