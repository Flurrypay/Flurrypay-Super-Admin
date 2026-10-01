"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FilterXIcon,
  InboxIcon,
  MailCheckIcon,
  MailOpenIcon,
  PaperclipIcon,
  SendIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { Pagination } from "@/components/data-table/pagination";
import type { DataColumn } from "@/components/data-table/types";
import { DetailList, DetailSection } from "@/components/detail/detail-list";
import { SelectFilter } from "@/components/filters/select-filter";
import { DateTime } from "@/components/format/date-time";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { resolveStatus, StatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useHasPermission } from "@/features/auth/admin-context";
import { getUserMessage } from "@/lib/api/errors";

import {
  fetchSupportMessage,
  fetchSupportMessages,
  markSupportMessageRead,
  parseSupportKey,
  replyToSupportMessage,
  setSupportStatus,
  SUPPORT_FILTERS,
  SUPPORT_TYPES,
  supportKey,
  type SupportMessage,
  type SupportType,
} from "./api";
import {
  SUPPORT_STATUS,
  SUPPORT_STATUS_OPTIONS,
  SUPPORT_TYPE_LABEL,
  supportSubject,
} from "./labels";

/** The shortest reply worth emailing someone. */
const MIN_REPLY_LENGTH = 10;

interface Props {
  state: {
    page: number;
    size: number;
    status: (typeof SUPPORT_FILTERS)[number] | null;
    kind: SupportType | null;
    /** The open thread's key, from a deep link or a clicked row. */
    message: string | null;
  };
  setState: (patch: Record<string, unknown>) => unknown;
}

export function InboxPanel({ state, setState }: Props) {
  const canReply = useHasPermission("support.reply");
  const query = {
    page: state.page,
    pageSize: state.size,
    status: state.status,
    type: state.kind,
  };
  const result = useQuery({
    queryKey: ["support", "inbox", query],
    queryFn: ({ signal }) => fetchSupportMessages(query, signal),
    placeholderData: keepPreviousData,
  });

  const open = parseSupportKey(state.message);
  const filtering = Boolean(state.status || state.kind);

  const columns: DataColumn<SupportMessage>[] = [
    {
      id: "from",
      header: "From",
      required: true,
      cell: (m) => (
        <span className="grid leading-tight">
          <span className="flex items-center gap-1.5">
            {/*
              Unread is carried by the dot AND by the weight, never by colour
              alone — and it is announced, because "which of these have I not
              read" is the whole reason this column is first.
            */}
            {!m.readByAdmin && (
              <>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="sr-only">Unread.</span>
              </>
            )}
            <span className={m.readByAdmin ? "truncate" : "truncate font-semibold"}>
              {m.name || m.email || "Unknown sender"}
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">{m.email}</span>
        </span>
      ),
      exportValue: (m) => m.email,
      sensitive: true,
    },
    {
      id: "subject",
      header: "Subject",
      cell: (m) => (
        <span className="grid leading-tight">
          <span className="flex items-center gap-1.5">
            <span className="max-w-80 truncate">{supportSubject(m)}</span>
            {m.fileUrl && (
              <>
                <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">Has an attachment.</span>
              </>
            )}
          </span>
          <span className="max-w-80 truncate text-xs text-muted-foreground">{m.message}</span>
        </span>
      ),
      exportValue: (m) => supportSubject(m),
    },
    {
      id: "type",
      header: "Kind",
      priority: "secondary",
      cell: (m) => (
        <Badge tone={m.type === "appeal" ? "warning" : "neutral"}>
          {SUPPORT_TYPE_LABEL[m.type]}
        </Badge>
      ),
      exportValue: (m) => SUPPORT_TYPE_LABEL[m.type],
    },
    {
      id: "status",
      header: "Status",
      cell: (m) => <StatusBadge status={resolveStatus(SUPPORT_STATUS, m.status)} />,
      exportValue: (m) => m.status,
    },
    {
      id: "replies",
      header: "Replies",
      align: "right",
      priority: "tertiary",
      cell: (m) =>
        m.replies.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span>{m.replies.length}</span>
        ),
      exportValue: (m) => m.replies.length,
    },
    {
      id: "submittedAt",
      header: "Received",
      priority: "secondary",
      cell: (m) => <DateTime value={m.submittedAt} />,
      exportValue: (m) => m.submittedAt,
    },
  ];

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Status"
          value={state.status}
          options={SUPPORT_FILTERS.filter((v) => v !== "all").map((value) => ({
            value,
            label: value === "unread" ? "Unread" : resolveStatus(SUPPORT_STATUS, value).label,
          }))}
          onChange={(status) => void setState({ status, page: 1 })}
        />
        <SelectFilter
          label="Kind"
          value={state.kind}
          options={SUPPORT_TYPES.map((value) => ({ value, label: SUPPORT_TYPE_LABEL[value] }))}
          onChange={(kind) => void setState({ kind, page: 1 })}
        />
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void setState({ status: null, kind: null, page: 1 })}
          >
            <FilterXIcon aria-hidden />
            Clear filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {result.data && (
            <span className="text-xs text-muted-foreground">
              {result.data.summary.unread} unread · {result.data.summary.totalAppeals} appeals ·{" "}
              {result.data.summary.totalContact} contact
            </span>
          )}
          <Freshness
            updatedAt={result.dataUpdatedAt}
            isFetching={result.isFetching}
            onRefresh={() => void result.refetch()}
          />
        </div>
      </div>

      <DataTable
        label="Support inbox"
        subject="support messages"
        columns={columns}
        rows={result.data?.rows ?? []}
        getRowId={supportKey}
        isLoading={result.isFetching}
        error={result.error}
        onRetry={() => void result.refetch()}
        onRowActivate={(m) => void setState({ message: supportKey(m) })}
        activeRowId={state.message}
        empty={{
          icon: InboxIcon,
          title: filtering ? "No messages match" : "Nothing in the inbox",
          description: filtering
            ? "Clear a filter to see more."
            : "Account appeals and contact-us messages from customers arrive here.",
        }}
      />

      <Pagination
        page={state.page}
        pageSize={state.size}
        total={result.data?.total ?? 0}
        onPageChange={(page) => void setState({ page })}
        onPageSizeChange={(size) => void setState({ size: Math.min(size, 100), page: 1 })}
      />

      <MessageDrawer
        open={open}
        onClose={() => void setState({ message: null })}
        canReply={canReply}
      />
    </div>
  );
}

/**
 * The drawer shell.
 *
 * Split from its contents so the contents can take a non-null thread. The whole
 * panel is about one (type, id) pair, and threading a nullable one through every
 * query and mutation inside means each of them has to re-assert that it is open —
 * which is the version of this that eventually gets an assertion wrong.
 */
function MessageDrawer({
  open,
  onClose,
  canReply,
}: {
  open: { type: SupportType; id: string } | null;
  onClose: () => void;
  canReply: boolean;
}) {
  return (
    <Sheet
      open={open !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open && (
        <MessageThread
          // Remounts on a different thread, which resets the reply draft — a
          // half-typed reply must never follow the admin to another customer.
          key={`${open.type}:${open.id}`}
          target={open}
          canReply={canReply}
        />
      )}
    </Sheet>
  );
}

function MessageThread({
  target,
  canReply,
}: {
  target: { type: SupportType; id: string };
  canReply: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const detail = useQuery({
    queryKey: ["support", "message", target.type, target.id],
    queryFn: ({ signal }) => fetchSupportMessage(target.type, target.id, signal),
  });

  function refreshInbox() {
    void queryClient.invalidateQueries({ queryKey: ["support", "inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["support", "message"] });
    // The bell's unread count includes the alert raised when this arrived.
    void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  }

  const markRead = useMutation({
    mutationFn: () => markSupportMessageRead(target.type, target.id),
    onSuccess: refreshInbox,
    // Silent: the admin did not ask for this, it is a side effect of opening the
    // thread, and a toast about it would be noise on every single open.
    onError: () => undefined,
  });

  /**
   * Opening a thread marks it read.
   *
   * Deliberately an effect rather than something the row's click handler does:
   * a deep link from a notification opens this drawer without any row ever being
   * clicked, and that arrival has read the message just as much.
   */
  const data = detail.data;
  const alreadyRead = data?.readByAdmin ?? true;
  useEffect(() => {
    if (data && !alreadyRead && !markRead.isPending) markRead.mutate();
    // Keyed on whether it is still unread, not on the mutation: depending on
    // `markRead` would re-run this every time the mutation object changes
    // identity, which is every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyRead, data]);

  const reply = useMutation({
    mutationFn: (message: string) => replyToSupportMessage(target.type, target.id, message),
    onSuccess: () => {
      toast.success("Reply emailed to the customer");
      setDraft("");
      refreshInbox();
    },
    onError: (error) => toast.error(getUserMessage(error)),
  });

  const status = useMutation({
    mutationFn: (next: string) => setSupportStatus(target.type, target.id, next),
    onSuccess: () => {
      toast.success("Status updated");
      refreshInbox();
    },
    onError: (error) => toast.error(getUserMessage(error)),
  });

  // Appeals and contact messages name their body differently; the detail
  // endpoint returns the raw row, so read whichever is present.
  const body = data ? (data.explanation ?? data.message ?? "") : "";
  const subject = data ? (data.reasonForAppeal ?? data.subject ?? "") : "";
  const trimmed = draft.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_REPLY_LENGTH;

  return (
    <SheetContent className="sm:max-w-2xl">
      <SheetHeader>
        <SheetTitle>{subject || SUPPORT_TYPE_LABEL[target.type]}</SheetTitle>
        <SheetDescription>{data ? `${data.name} <${data.email}>` : "Loading…"}</SheetDescription>
      </SheetHeader>
      <SheetBody className="grid gap-5">
        {detail.isPending ? (
          <Skeleton className="h-64" />
        ) : detail.isError ? (
          <ErrorState
            error={detail.error}
            subject="this message"
            onRetry={() => void detail.refetch()}
          />
        ) : (
          data && (
            <>
              <DetailList
                items={[
                  { label: "Kind", value: SUPPORT_TYPE_LABEL[target.type] },
                  {
                    label: "Status",
                    value: <StatusBadge status={resolveStatus(SUPPORT_STATUS, data.status)} />,
                  },
                  { label: "Category", value: data.category, hideWhenEmpty: true },
                  { label: "Phone", value: data.number, hideWhenEmpty: true },
                  { label: "Received", value: <DateTime value={data.submittedAt} /> },
                  {
                    label: "Customer record",
                    // Only appeals carry a userId; a contact message may come
                    // from someone who has no account at all.
                    value: data.userId ? (
                      <Link href={`/users/${data.userId}`} className="hover:underline">
                        Open customer
                      </Link>
                    ) : null,
                    hideWhenEmpty: true,
                  },
                  {
                    label: "Attachment",
                    /*
                          Opened in a new tab rather than rendered inline. The
                          file is customer-supplied and served from a host this
                          console does not control, so embedding it would put
                          foreign content inside an authenticated admin page.
                          rel="noreferrer" keeps the console URL out of that
                          host's logs.
                        */
                    value: data.fileUrl ? (
                      <a
                        href={data.fileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <PaperclipIcon className="size-3.5" aria-hidden />
                        {data.fileName ?? "View attachment"}
                      </a>
                    ) : null,
                    hideWhenEmpty: true,
                  },
                ]}
              />

              <DetailSection title="What they wrote">
                <p className="text-sm whitespace-pre-wrap">{body || "No message body."}</p>
              </DetailSection>

              <DetailSection
                title={`Replies (${data.replies.length})`}
                description="Sent to the customer by email."
              >
                {data.replies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody has replied to this yet.</p>
                ) : (
                  <ol className="grid gap-3">
                    {data.replies.map((item, index) => (
                      <li
                        key={`${item.sentAt}-${index}`}
                        className="rounded-md border bg-muted/30 px-3 py-2"
                      >
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <MailCheckIcon className="size-3.5" aria-hidden />
                          <span>{item.adminEmail || "An administrator"}</span>
                          <DateTime value={item.sentAt} />
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{item.message}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </DetailSection>

              {canReply ? (
                <DetailSection
                  title="Reply"
                  description={`Emailed to ${data.email}. The customer may not be able to sign in, so this is the only channel that reaches them.`}
                >
                  <div className="grid gap-2">
                    <label htmlFor="support-reply" className="sr-only">
                      Reply to {data.name}
                    </label>
                    <Textarea
                      id="support-reply"
                      rows={5}
                      value={draft}
                      placeholder="Write the reply the customer will receive…"
                      aria-invalid={tooShort}
                      aria-describedby="support-reply-hint"
                      onChange={(event) => {
                        setDraft(event.target.value);
                      }}
                    />
                    <p id="support-reply-hint" className="text-xs text-muted-foreground">
                      {tooShort
                        ? `At least ${MIN_REPLY_LENGTH} characters.`
                        : "Sent as soon as you press Send — there is no draft and no undo."}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={trimmed.length < MIN_REPLY_LENGTH || reply.isPending}
                        onClick={() => {
                          reply.mutate(trimmed);
                        }}
                      >
                        <SendIcon aria-hidden />
                        {reply.isPending ? "Sending…" : "Send reply"}
                      </Button>
                    </div>
                  </div>
                </DetailSection>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You can read this message but not reply to it. Replying needs the &ldquo;Reply to
                  support&rdquo; permission.
                </p>
              )}
            </>
          )
        )}
      </SheetBody>
      {canReply && data && (
        <SheetFooter className="flex-wrap gap-2">
          {/*
                Status is set from the footer rather than the body: it is the
                decision, and it is the last thing done to a thread. Each option
                is a single button so the act is one click with a visible label,
                not a dropdown whose current value could be mistaken for a choice
                already made.
              */}
          <span className="mr-auto text-xs text-muted-foreground">Mark this thread as</span>
          {SUPPORT_STATUS_OPTIONS[target.type]
            .filter((option) => option !== data.status)
            .map((option) => {
              const definition = resolveStatus(SUPPORT_STATUS, option);
              return (
                <Button
                  key={option}
                  variant={definition.tone === "danger" ? "destructive" : "outline"}
                  size="sm"
                  disabled={status.isPending}
                  onClick={() => {
                    status.mutate(option);
                  }}
                >
                  <MailOpenIcon aria-hidden />
                  {definition.label}
                </Button>
              );
            })}
        </SheetFooter>
      )}
    </SheetContent>
  );
}
