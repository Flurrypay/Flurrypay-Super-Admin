"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, ImageIcon, MessageSquareIcon, SendIcon, ZoomInIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DateTime } from "@/components/format/date-time";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
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
import { useAdmin } from "@/features/auth/admin-context";
import { fetchChatConversation, replyToChat } from "@/features/support/api";
import { getUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

import { startDirectChat, type UserDetail } from "./api";

function isImageUrl(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("data:image/")) &&
    (/\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(trimmed) ||
      trimmed.includes("res.cloudinary.com") ||
      trimmed.startsWith("data:image/"))
  );
}

export function UserDirectChat({ userId, user }: { userId: string; user: UserDetail }) {
  const queryClient = useQueryClient();
  const admin = useAdmin();
  const [draft, setDraft] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  // 1. Initiate or load the chat room for this user
  const initChat = useQuery({
    queryKey: ["direct-chat-room", userId],
    queryFn: () => startDirectChat(userId),
    staleTime: 60_000,
  });

  const roomId = initChat.data?.roomId;

  // 2. Poll for messages once roomId is available
  const conversation = useQuery({
    queryKey: ["support", "chat-room", roomId],
    queryFn: ({ signal }) => fetchChatConversation(roomId ?? "", signal),
    enabled: Boolean(roomId),
    refetchInterval: 3_000,
  });

  const messages: Array<{
    id: string;
    senderId: string;
    message: string;
    createdAt: string;
  }> = conversation.data?.messages ?? initChat.data?.messages ?? [];
  const customerName = `${user.firstName} ${user.lastName}`.trim() || user.email || "Customer";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [roomId, messages.length]);

  const send = useMutation({
    mutationFn: (msg: string) => {
      if (!roomId) throw new Error("No active room");
      return replyToChat(roomId, msg);
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["support", "chat-room", roomId] });
      void queryClient.invalidateQueries({ queryKey: ["support", "chat-rooms"] });
    },
    onError: (error) => {
      toast.error(getUserMessage(error));
    },
  });

  const trimmed = draft.trim();

  if (initChat.isPending) {
    return <Skeleton className="h-[520px] w-full rounded-md" />;
  }

  if (initChat.isError) {
    return (
      <ErrorState
        error={initChat.error}
        subject="conversation with customer"
        onRetry={() => void initChat.refetch()}
      />
    );
  }

  return (
    <div className="flex h-[560px] flex-col overflow-hidden rounded-md border bg-card shadow-xs">
      <header className="z-10 flex flex-none items-center justify-between border-b bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="size-4 text-primary" aria-hidden />
          <div className="grid leading-tight">
            <p className="text-sm font-semibold">{customerName}</p>
            <p className="text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">In-app direct chat thread</span>
      </header>

      {/* Messages area */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-background/50 px-4 py-3">
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquareIcon}
            title="No messages yet"
            description="Send a message to this customer. It appears in their app support chat immediately."
          />
        ) : (
          <ol className="grid gap-2">
            {messages.map((message) => {
              const mine = message.senderId === admin.id;
              return (
                <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-md px-3 py-2 text-sm",
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "border bg-muted/50 text-foreground",
                    )}
                  >
                    <p className="sr-only">{mine ? "From support" : `From ${customerName}`}</p>
                    {isImageUrl(message.message) ? (
                      <Dialog>
                        <div className="my-1 space-y-1">
                          <DialogTrigger asChild>
                            <button
                              type="button"
                              className="group relative block cursor-zoom-in overflow-hidden rounded border border-white/20 text-left focus:outline-none"
                              title="Click to view full image"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={message.message}
                                alt="Chat attachment"
                                className="max-h-60 max-w-full rounded bg-black/10 object-contain"
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
                                "inline-block cursor-pointer text-[11px] underline",
                                mine
                                  ? "text-primary-foreground/80 hover:text-white"
                                  : "text-primary hover:underline",
                              )}
                            >
                              View full image
                            </button>
                          </DialogTrigger>
                        </div>
                        <DialogContent className="flex max-h-[92vh] max-w-[96vw] flex-col gap-3 bg-background/95 p-4 backdrop-blur-md sm:max-w-4xl">
                          <DialogHeader className="flex flex-row items-center justify-between border-b pr-8 pb-2">
                            <DialogTitle className="text-base font-semibold">
                              Image attachment
                            </DialogTitle>
                            <a
                              href={message.message}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                              title="Open original file in new tab"
                            >
                              <ExternalLinkIcon className="size-3.5" aria-hidden />
                              Open original
                            </a>
                          </DialogHeader>
                          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-muted/20 p-2">
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
                        "mt-1 text-[11px]",
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

      {/* Input footer */}
      <footer className="z-10 flex-none border-t bg-card px-4 py-3">
        {showImageInput && (
          <div className="mb-2 flex items-center gap-2">
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
          <label htmlFor="user-chat-reply" className="sr-only">
            Message {customerName}
          </label>
          <Textarea
            id="user-chat-reply"
            rows={2}
            value={draft}
            placeholder={`Message ${customerName} directly in-app…`}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && trimmed && !send.isPending) {
                e.preventDefault();
                send.mutate(trimmed);
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
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
            <Button
              size="sm"
              disabled={trimmed.length === 0 || send.isPending}
              onClick={() => {
                send.mutate(trimmed);
              }}
            >
              <SendIcon aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
