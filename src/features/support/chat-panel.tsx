"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarIcon,
  ExternalLinkIcon,
  ImageIcon,
  MessagesSquareIcon,
  SendIcon,
  UserIcon,
  ZoomInIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { UpdateDobDialog } from "@/features/users/update-dob-dialog";
import { getUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

import {
  type ChatRoom,
  fetchChatConversation,
  fetchChatRooms,
  isFromAdmin,
  replyToChat,
} from "./api";

/** How often the open conversation re-reads for live message delivery. */
const CONVERSATION_POLL_MS = 3_000;
const ROOMS_POLL_MS = 8_000;

function isImageUrl(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/")) &&
    (/\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(trimmed) || trimmed.includes("res.cloudinary.com") || trimmed.startsWith("data:image/"))
  );
}

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

      <div className="grid gap-3 lg:grid-cols-[22rem_1fr] h-[calc(100vh-14rem)] min-h-[580px]">
        {/* Left column: ONLY the user list scrolls */}
        <div className="flex h-full flex-col overflow-hidden">
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
            <div className="flex-1 overflow-y-auto rounded-md border bg-card">
              <ul className="divide-y">
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
            </div>
          )}
          {rooms.data && rooms.data.total > rooms.data.rows.length && (
            <div className="flex-none pt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
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

        {/* Right column: Chatbox does NOT scroll off the page */}
        <div className="h-full overflow-hidden">
          {selected ? (
            <Conversation roomId={selected} />
          ) : (
            <div className="h-full flex items-center justify-center rounded-md border bg-card">
              <EmptyState
                icon={MessagesSquareIcon}
                title="Pick a conversation"
                description="Choose a customer on the left to read the thread and reply."
              />
            </div>
          )}
        </div>
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

function Conversation({ roomId }: { roomId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
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
    <div className="flex h-full flex-col overflow-hidden rounded-md border bg-card">
      <header className="flex-none flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2.5 z-10">
        <div className="grid leading-tight">
          <p className="text-sm font-medium">{customerName}</p>
          {customer && <p className="text-xs text-muted-foreground">{customer.email}</p>}
        </div>
        {customer && (
          <div className="flex items-center gap-2">
            <UpdateDobDialog
              user={customer}
              trigger={
                <Button variant="outline" size="sm">
                  <CalendarIcon aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  Update DOB
                </Button>
              }
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/users/${customer.id}`}>
                <UserIcon aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                Open customer
              </Link>
            </Button>
          </div>
        )}
      </header>

      {/* Messages area — scrollable inside */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 space-y-2">
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
                    {isImageUrl(message.message) ? (
                      <Dialog>
                        <div className="space-y-1 my-1">
                          <DialogTrigger asChild>
                            <button
                              type="button"
                              className="group relative block overflow-hidden rounded border border-white/20 cursor-zoom-in text-left focus:outline-none focus:ring-2 focus:ring-primary/50"
                              title="Click to view full image"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={message.message}
                                alt="Chat attachment"
                                className="max-h-60 max-w-full rounded object-contain bg-black/10 transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                <span className="inline-flex items-center gap-1 rounded bg-black/75 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
                                  <ZoomInIcon className="size-3" aria-hidden />
                                  View
                                </span>
                              </div>
                            </button>
                          </DialogTrigger>
                          <DialogTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "text-[11px] underline cursor-pointer inline-block",
                                mine ? "text-primary-foreground/80 hover:text-white" : "text-primary hover:underline",
                              )}
                            >
                              View full image
                            </button>
                          </DialogTrigger>
                        </div>
                        <DialogContent className="sm:max-w-4xl max-w-[96vw] max-h-[92vh] flex flex-col gap-3 p-4 bg-background/95 backdrop-blur-md">
                          <DialogHeader className="flex flex-row items-center justify-between pr-8 border-b pb-2">
                            <DialogTitle className="text-base font-semibold">Image attachment</DialogTitle>
                            <a
                              href={message.message}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                              title="Open original file in new tab"
                            >
                              <ExternalLinkIcon className="size-3.5" aria-hidden />
                              Open original
                            </a>
                          </DialogHeader>
                          <div className="flex flex-1 items-center justify-center overflow-auto rounded-md bg-muted/20 p-2 min-h-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={message.message}
                              alt="Chat attachment full size"
                              className="max-h-[78vh] max-w-full rounded object-contain shadow-md"
                            />
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.message}</p>
                    )}
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

      {/* Footer — always anchored at the bottom of the chatbox */}
      <footer className="flex-none border-t bg-card px-4 py-3 z-10">
        {showImageInput && (
          <div className="flex items-center gap-2 mb-2">
            <input
              type="url"
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              placeholder="Paste photo URL (https://...) to send photo to customer..."
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && imageUrl.trim()) {
                  e.preventDefault();
                  send.mutate(imageUrl.trim());
                  setImageUrl("");
                  setShowImageInput(false);
                }
              }}
            />
            <Button
              size="sm"
              disabled={!imageUrl.trim() || send.isPending}
              onClick={() => {
                if (imageUrl.trim()) {
                  send.mutate(imageUrl.trim());
                  setImageUrl("");
                  setShowImageInput(false);
                }
              }}
            >
              Send Photo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowImageInput(false);
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        <div className="grid gap-2">
          <label htmlFor="chat-reply" className="sr-only">
            Reply to {customerName}
          </label>
          <Textarea
            id="chat-reply"
            rows={2}
            value={draft}
            placeholder="Type a reply to customer…"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && trimmed && !send.isPending) {
                event.preventDefault();
                send.mutate(trimmed);
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setShowImageInput((prev) => !prev);
                }}
              >
                <ImageIcon aria-hidden className="mr-1 h-3.5 w-3.5" />
                Attach Photo
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Enter sends · Shift + Enter for a new line
              </span>
            </div>
            <Button
              size="sm"
              disabled={trimmed.length === 0 || send.isPending}
              onClick={() => {
                send.mutate(trimmed);
              }}
            >
              <SendIcon aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
