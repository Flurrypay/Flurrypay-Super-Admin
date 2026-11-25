"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, FileWarningIcon, ZoomInIcon } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group relative block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-md border bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all hover:border-primary/50 hover:shadow-md"
              title={`Click to view ${label} in fullscreen`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from the API */}
              <img
                src={url.data}
                alt={label}
                onError={() => {
                  setImageError(true);
                }}
                referrerPolicy="no-referrer"
                className="max-h-56 max-w-full rounded-md object-contain transition-transform duration-200 group-hover:scale-[1.02] sm:max-w-72"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
                  <ZoomInIcon className="size-3.5 text-primary" aria-hidden />
                  View full size
                </span>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-5xl max-w-[96vw] max-h-[92vh] flex flex-col gap-3 p-4 bg-background/95 backdrop-blur-md">
            <DialogHeader className="flex flex-row items-center justify-between pr-8 border-b pb-2">
              <DialogTitle className="text-base font-semibold">{label}</DialogTitle>
              {url.data && (
                <a
                  href={url.data}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  title="Open in new window as fallback"
                >
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                  Open original
                </a>
              )}
            </DialogHeader>
            <div className="flex flex-1 items-center justify-center overflow-auto rounded-md bg-muted/20 p-2 min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url.data}
                alt={label}
                referrerPolicy="no-referrer"
                className="max-h-[78vh] max-w-full rounded object-contain shadow-md"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}
