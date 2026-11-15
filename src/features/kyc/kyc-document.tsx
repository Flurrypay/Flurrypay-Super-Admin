"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, FileWarningIcon } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getUserMessage } from "@/lib/api/errors";

import { resolveDocumentUrl } from "./api";

const DISPLAYABLE =
  /^(https?:\/\/|\/files\/private\/|data:image\/|private:|private\/|[a-zA-Z0-9_\-./]+)/;

/**
 * Shows a KYC document. Private files get a short-lived signed URL (5 minutes),
 * fetched on view and never cached beyond it.
 */
export function KycDocument({ location, label }: { location: string | null; label: string }) {
  const [imageError, setImageError] = useState(false);
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

  if (imageError) {
    return (
      <figure className="grid max-w-full min-w-0 gap-1.5">
        <div className="flex h-40 w-64 flex-col items-center justify-center rounded-md border border-dashed bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          <FileWarningIcon className="mb-1.5 size-5 text-warning" aria-hidden />
          <span>Unable to display preview</span>
          {url.data && (
            <a
              href={url.data}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
            >
              <ExternalLinkIcon className="size-3" />
              Open file directly
            </a>
          )}
        </div>
        <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      </figure>
    );
  }

  const isPdf = /\.pdf(\?|$)/i.test(location);
  return (
    <figure className="grid max-w-full min-w-0 gap-1.5">
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
        <a
          href={url.data}
          target="_blank"
          rel="noreferrer noopener"
          className="block w-fit max-w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from the API */}
          <img
            src={url.data}
            alt={label}
            onError={() => {
              setImageError(true);
            }}
            referrerPolicy="no-referrer"
            className="max-h-56 max-w-full rounded-md border bg-muted object-contain sm:max-w-72"
          />
        </a>
      )}
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}
