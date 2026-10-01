"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquareIcon, SendIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Freshness } from "@/components/states/freshness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useHasPermission } from "@/features/auth/admin-context";
import { getUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

import {
  type ChatRoom,
  fetchChatConversation,
  fetchChatRooms,
  isFromAdmin,
  replyToChat,
} from "./api";

/** How often the open conversation re-reads. The API has no socket for the console yet. */
const CONVERSATION_POLL_MS = 15_000;
const ROOMS_POLL_MS = 30_000;

interface Props {
  state: { room: string | null };
  setState: (patch: Record<string, unknown>) => unknown;
}

/**
 * Live support chat, answered from the console.
 *
 * Polled rather than socket-driven. The API does emit `admin_new_chat_message`
 * over Socket.IO, but this console has no socket client of its own yet, and a
 * fifteen-second poll on one open conversation is a better answer than a chat
 * screen that cannot be used at all. Worth replacing with the socket when one
 * exists — the query keys below are already the right invalidation boundary.
 */
export function ChatPanel({ state, setState }: Props) {
  const canReply = useHasPermission("support.reply");
  const [page, setPage] = useState(1);

  const rooms = useQuery({
    queryKey: ["support", "chat-rooms", page],
    queryFn: ({ signal }) => fetchChatRooms({ page, pageSize: 50 }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: ROOMS_POLL_MS,
  });

  const selected = state.room;

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          In-app conversations with customers. Replies appear in their app immediately.
        </p>
        <Freshness
          updatedAt={rooms.dataUpdatedAt}
          isFetching={rooms.isFetching}
          onRefresh={() => void rooms.refetch()}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[22rem_1fr]">
        <div className="grid content-start gap-2">
          {rooms.isPending && (
            <div className="grid gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          )}
          {rooms.isError && (
            <ErrorState
              error={rooms.error}
              subject="conversations"
              onRetry={() => void rooms.refetch()}
            />
          )}
          {rooms.isSuccess && rooms.data.rows.length === 0 && (
            <EmptyState
              icon={MessagesSquareIcon}
              title="No conversations"
              description="A room appears here the first time a customer messages support from the app."
            />
          )}
          {rooms.data && rooms.data.rows.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-md border bg-card">
              {rooms.data.rows.map((room) => (
                <li key={room.roomId}>
                  <RoomButton
                    room={room}
                    active={room.roomId === selected}
                    onSelect={() => void setState({ room: room.roomId })}
                  />
                </li>
              ))}
            </ul>
          )}
          {rooms.data && rooms.data.total > rooms.data.rows.length && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                }}
              >
                Newer
              </Button>
              <span>
                {rooms.data.rows.length} of {rooms.data.total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 50 >= rooms.data.total}
                onClick={() => {
                  setPage((p) => p + 1);
                }}
              >
                Older
              </Button>
            </div>
          )}
        </div>

        {selected ? (
          <Conversation roomId={selected} canReply={canReply} />
        ) : (
          <div className="rounded-md border bg-card">
            <EmptyState
              icon={MessagesSquareIcon}
              title="Pick a conversation"
              description="Choose a customer on the left to read the thread and reply."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RoomButton({
  room,
  active,
  onSelect,
}: {
  room: ChatRoom;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "grid w-full gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        active && "bg-accent/40",
      )}
    >
      <span className="flex items-center gap-2 text-sm">
        <span className={cn("min-w-0 flex-1 truncate", room.unreadCount > 0 && "font-semibold")}>
          {room.userName}
        </span>
        {room.unreadCount > 0 && (
          <Badge tone="danger">
            {room.unreadCount}
            <span className="sr-only"> unread</span>
          </Badge>
        )}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {/*
          Says who spoke last. Without it an admin cannot tell "they are waiting
          on me" from "I answered and they went quiet", which is the only thing
          this list is for.
        */}
        {room.lastMessage
          ? `${room.lastMessageFromAdmin ? "You: " : ""}${room.lastMessage}`
          : "No messages yet"}
      </span>
      <span className="text-xs text-muted-foreground">
        <DateTime value={room.lastMessageAt ?? room.updatedAt} format="relative" />
      </span>
    </button>
  );
}

function Conversation({ roomId, canReply }: { roomId: string; canReply: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const conversation = useQuery({
    queryKey: ["support", "chat-room", roomId],
    queryFn: ({ signal }) => fetchChatConversation(roomId, signal),
    refetchInterval: CONVERSATION_POLL_MS,
  });

  const messages = conversation.data?.messages ?? [];
  const customer = conversation.data?.user ?? null;
  const customerName = customer
    ? `${customer.firstName} ${customer.lastName}`.trim() || customer.email
    : "Customer";

  /**
   * Reading a room marks the customer's messages read, server-side.
   *
   * So the room list has to be refreshed after a successful read, or the console
   * keeps showing unread badges it has itself just cleared.
   */
  const loadedAt = conversation.dataUpdatedAt;
  useEffect(() => {
    if (loadedAt) void queryClient.invalidateQueries({ queryKey: ["support", "chat-rooms"] });
  }, [loadedAt, roomId, queryClient]);

  // Jump to the newest message when the thread changes or grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [roomId, messages.length]);

  const send = useMutation({
    mutationFn: (message: string) => replyToChat(roomId, message),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["support", "chat-room", roomId] });
      void queryClient.invalidateQueries({ queryKey: ["support", "chat-rooms"] });
    },
    onError: (error) => toast.error(getUserMessage(error)),
  });

  const trimmed = draft.trim();

  return (
    <div className="grid grid-rows-[auto_1fr_auto] rounded-md border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="grid leading-tight">
          <p className="text-sm font-medium">{customerName}</p>
          {customer && <p className="text-xs text-muted-foreground">{customer.email}</p>}
        </div>
        {customer && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/users/${customer.id}`}>
              <UserIcon aria-hidden />
              Open customer
            </Link>
          </Button>
        )}
      </header>

      <div className="max-h-[28rem] min-h-48 overflow-y-auto px-4 py-3">
        {conversation.isPending && (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}
        {conversation.isError && (
          <ErrorState
            error={conversation.error}
            subject="this conversation"
            onRetry={() => void conversation.refetch()}
          />
        )}
        {conversation.isSuccess && messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No messages in this conversation yet. You can start it below.
          </p>
        )}
        {messages.length > 0 && (
          <ol className="grid gap-2">
            {messages.map((message) => {
              const mine = isFromAdmin(message, customer?.id ?? null);
              return (
                <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-md px-3 py-2 text-sm",
                      mine ? "bg-primary text-primary-foreground" : "border bg-muted/40",
                    )}
                  >
                    {/*
                      Named, not just positioned. Alignment and colour alone do
                      not survive a screen reader, and "who said this" is the one
                      thing a support thread cannot be ambiguous about.
                    */}
                    <p className="sr-only">{mine ? "From support" : `From ${customerName}`}</p>
                    <p className="whitespace-pre-wrap">{message.message}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        mine ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      <DateTime value={message.createdAt} format="relative" />
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <footer className="border-t px-4 py-3">
        {canReply ? (
          <div className="grid gap-2">
            <label htmlFor="chat-reply" className="sr-only">
              Reply to {customerName}
            </label>
            <Textarea
              id="chat-reply"
              rows={2}
              value={draft}
              placeholder="Type a reply…"
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter makes a new line — what every chat
                // does, and what people will try first.
                if (event.key === "Enter" && !event.shiftKey && trimmed && !send.isPending) {
                  event.preventDefault();
                  send.mutate(trimmed);
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Enter sends · Shift + Enter for a new line
              </span>
              <Button
                size="sm"
                disabled={trimmed.length === 0 || send.isPending}
                onClick={() => {
                  send.mutate(trimmed);
                }}
              >
                <SendIcon aria-hidden />
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You can read this conversation but not reply. Replying needs the &ldquo;Reply to
            support&rdquo; permission.
          </p>
        )}
      </footer>
    </div>
  );
}
