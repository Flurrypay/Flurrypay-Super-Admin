"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  HistoryIcon,
  LoaderCircleIcon,
  MailIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  SmartphoneIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm/confirm-action-dialog";
import { DateTime } from "@/components/format/date-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  AUDIENCE_GROUPS,
  type BroadcastRecord,
  deleteBroadcastHistory,
  type DeliveryMethod,
  fetchAutomatedPushStats,
  fetchBroadcastHistory,
  fetchBroadcastRecipientCount,
  sendBroadcastMessage,
  triggerAutomatedPushSweep,
} from "./api";

interface DraftMessage {
  id: string;
  title: string;
  content: string;
  audience: string;
  deliveryMethod: DeliveryMethod;
  specificEmails?: string[];
}

const PAGE_SIZE = 10;

export function BroadcastsView() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"compose" | "history" | "automated">("compose");

  // Compose State
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("ALL");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("EMAIL_AND_PUSH");
  const [emailInput, setEmailInput] = useState("");
  const [specificEmails, setSpecificEmails] = useState<string[]>([]);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // Drafts
  const [drafts, setDrafts] = useState<DraftMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("flurrypay_broadcast_drafts");
      return saved ? (JSON.parse(saved) as DraftMessage[]) : [];
    } catch {
      return [];
    }
  });

  // History Pagination
  const [historyPage, setHistoryPage] = useState(1);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

  // Automated Push Triggers
  const [triggeringSweep, setTriggeringSweep] = useState(false);

  const saveDraftsToStorage = (updated: DraftMessage[]) => {
    setDrafts(updated);
    try {
      localStorage.setItem("flurrypay_broadcast_drafts", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Recipient Count Query
  const recipientCountQuery = useQuery({
    queryKey: ["broadcast-recipient-count", audience, specificEmails.length],
    queryFn: ({ signal }) => {
      if (audience === "SPECIFIC") {
        return Promise.resolve(specificEmails.length);
      }
      return fetchBroadcastRecipientCount(audience, signal);
    },
    staleTime: 60_000,
  });

  const matchedCount =
    audience === "SPECIFIC" ? specificEmails.length : (recipientCountQuery.data ?? 0);

  // History Query
  const historyQuery = useQuery({
    queryKey: ["broadcast-history", historyPage],
    queryFn: ({ signal }) => fetchBroadcastHistory(historyPage, PAGE_SIZE, signal),
  });

  const totalHistoryCount = historyQuery.data?.total ?? 0;
  const totalHistoryPages = historyQuery.data?.totalPages ?? 1;

  // Automated Stats Query
  const automatedStatsQuery = useQuery({
    queryKey: ["automated-push-stats"],
    queryFn: ({ signal }) => fetchAutomatedPushStats(signal),
    enabled: activeTab === "automated",
  });

  // Send Broadcast Mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      return sendBroadcastMessage({
        recipientType: audience,
        subject: subject.trim(),
        message: message.trim(),
        deliveryMethod,
        specificEmails: audience === "SPECIFIC" ? specificEmails : undefined,
      });
    },
    onSuccess: async () => {
      toast.success(
        `Broadcast queued for ${matchedCount.toLocaleString()} recipient(s) — sending in background.`,
      );
      setSubject("");
      setMessage("");
      setAudience("ALL");
      setSpecificEmails([]);
      setEmailInput("");
      setConfirmSendOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["broadcast-history"] });
      setActiveTab("history");
      setHistoryPage(1);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to dispatch broadcast";
      toast.error(message);
    },
  });

  // Delete History Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteBroadcastHistory(id);
    },
    onSuccess: async () => {
      toast.success("Broadcast history record deleted.");
      setDeletePendingId(null);
      await queryClient.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to delete broadcast record";
      toast.error(message);
    },
  });

  const handleAddEmail = () => {
    const raw = emailInput.trim().toLowerCase();
    if (!raw) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (specificEmails.includes(raw)) {
      setEmailInput("");
      return;
    }
    setSpecificEmails((prev) => [...prev, raw]);
    setEmailInput("");
  };

  const handleRemoveEmail = (target: string) => {
    setSpecificEmails((prev) => prev.filter((e) => e !== target));
  };

  const handleSaveDraft = () => {
    if (!subject.trim() && !message.trim()) {
      toast.error("Please enter a subject or message to save a draft");
      return;
    }
    const newDraft: DraftMessage = {
      id: Date.now().toString(),
      title: subject,
      content: message,
      audience,
      deliveryMethod,
      specificEmails,
    };
    saveDraftsToStorage([newDraft, ...drafts]);
    toast.success("Draft saved");
  };

  const handleLoadDraft = (draft: DraftMessage) => {
    setSubject(draft.title);
    setMessage(draft.content);
    setAudience(draft.audience);
    setDeliveryMethod(draft.deliveryMethod);
    setSpecificEmails(draft.specificEmails || []);
    // remove loaded draft
    saveDraftsToStorage(drafts.filter((d) => d.id !== draft.id));
    toast.info("Draft loaded into compose form");
  };

  const handleDeleteDraft = (id: string) => {
    saveDraftsToStorage(drafts.filter((d) => d.id !== id));
    toast.success("Draft removed");
  };

  const handleClear = () => {
    setSubject("");
    setMessage("");
    setAudience("ALL");
    setDeliveryMethod("EMAIL_AND_PUSH");
    setSpecificEmails([]);
    setEmailInput("");
  };

  const handleTriggerSweep = async (triggerId?: string) => {
    setTriggeringSweep(true);
    try {
      await triggerAutomatedPushSweep(triggerId);
      toast.success("Automated push sweep completed successfully!");
      await automatedStatsQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["broadcast-history"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to trigger automated sweep";
      toast.error(message);
    } finally {
      setTriggeringSweep(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Customer Support &amp; Outreach</h2>
        <p className="text-sm text-muted-foreground">
          Manage live user conversations, send push broadcasts, and manage in-app promotional
          campaigns.
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          setActiveTab(val as "compose" | "history" | "automated");
        }}
      >
        <TabsList className="grid w-full grid-cols-3 sm:w-[480px]">
          <TabsTrigger value="compose" className="gap-1.5">
            <SendIcon className="size-3.5" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <HistoryIcon className="size-3.5" />
            History ({totalHistoryCount})
          </TabsTrigger>
          <TabsTrigger value="automated" className="gap-1.5">
            <ZapIcon className="size-3.5" />
            Automated Triggers
            <Badge tone="info" className="ml-1 px-1 py-0 text-[10px]">
              Auto
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ─── COMPOSE TAB ────────────────────────────────────────────── */}
        <TabsContent value="compose" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-xs lg:col-span-2">
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-sm font-semibold">
                  Subject *
                </Label>
                <Input
                  id="subject"
                  placeholder="Announcement title"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                  }}
                  className="font-medium"
                />
              </div>

              {/* Recipients & Audience */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="audience" className="text-sm font-semibold">
                    Recipients
                  </Label>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2Icon className="size-3 text-emerald-600" />
                    {recipientCountQuery.isFetching ? (
                      <LoaderCircleIcon className="size-3 animate-spin" />
                    ) : (
                      `${matchedCount.toLocaleString()} recipients match`
                    )}
                  </span>
                </div>

                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger id="audience" className="w-full">
                    <SelectValue placeholder="Select target audience" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {AUDIENCE_GROUPS.map((group) => (
                      <SelectGroup key={group.group}>
                        <SelectLabel className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                          {group.group}
                        </SelectLabel>
                        {group.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="font-medium">{opt.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground">({opt.hint})</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {AUDIENCE_GROUPS.flatMap((g) => g.options).find((o) => o.value === audience)
                    ?.hint || "Select which customer segment will receive this announcement."}
                </p>
              </div>

              {/* Specific Emails Input */}
              {audience === "SPECIFIC" && (
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                  <Label className="text-xs font-semibold text-foreground">
                    Recipient Email Addresses ({specificEmails.length})
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="customer@example.com"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddEmail();
                        }
                      }}
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddEmail}
                      className="shrink-0 gap-1"
                    >
                      <PlusIcon className="size-3.5" />
                      Add
                    </Button>
                  </div>
                  {specificEmails.length > 0 && (
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pt-1">
                      {specificEmails.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-mono text-xs"
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() => {
                              handleRemoveEmail(email);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Send Via (Delivery Method) */}
              <div className="space-y-2">
                <Label htmlFor="deliveryMethod" className="text-sm font-semibold">
                  Send via
                </Label>
                <Select
                  value={deliveryMethod}
                  onValueChange={(val) => {
                    setDeliveryMethod(val as DeliveryMethod);
                  }}
                >
                  <SelectTrigger id="deliveryMethod" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL_AND_PUSH">
                      <span className="font-medium">Email + Push</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Both in-app push and customer mailbox)
                      </span>
                    </SelectItem>
                    <SelectItem value="PUSH">
                      <span className="font-medium">Push notification only</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Fastest, routine updates)
                      </span>
                    </SelectItem>
                    <SelectItem value="EMAIL">
                      <span className="font-medium">Email only</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Formal notice / important alerts)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Reserve email for confidential or important notices — most routine announcements
                  only need a push notification.
                </p>
              </div>

              {/* Message Body */}
              <div className="space-y-2">
                <Label htmlFor="message" className="text-sm font-semibold">
                  Message *
                </Label>
                <Textarea
                  id="message"
                  placeholder="Type your message..."
                  rows={7}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                  }}
                  className="leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!subject.trim() || !message.trim() || sendMutation.isPending}
                    loading={sendMutation.isPending}
                    onClick={() => {
                      if (!subject.trim() || !message.trim()) {
                        toast.error("Subject and message are required.");
                        return;
                      }
                      if (audience === "SPECIFIC" && specificEmails.length === 0) {
                        toast.error("Add at least one recipient email address.");
                        return;
                      }
                      setConfirmSendOpen(true);
                    }}
                    className="gap-2"
                  >
                    <SendIcon className="size-4" />
                    Send Now
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveDraft}
                    className="gap-1.5"
                  >
                    <SaveIcon className="size-4" />
                    Save Draft
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClear}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Sidebar: Drafts & Quick Tips */}
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <SaveIcon className="size-4 text-primary" />
                    Saved Drafts ({drafts.length})
                  </div>
                </div>

                {drafts.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No saved drafts. Click &quot;Save Draft&quot; to keep unfinished announcements.
                  </p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {drafts.map((d) => (
                      <div
                        key={d.id}
                        className="space-y-1.5 rounded-xl border bg-muted/40 p-3 text-xs transition-colors hover:border-primary/40"
                      >
                        <div className="truncate font-semibold text-foreground">
                          {d.title || "Untitled Draft"}
                        </div>
                        <p className="line-clamp-2 leading-relaxed text-muted-foreground">
                          {d.content || "(No message body)"}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {d.deliveryMethod}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-primary"
                              onClick={() => {
                                handleLoadDraft(d);
                              }}
                            >
                              Load
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-destructive"
                              onClick={() => {
                                handleDeleteDraft(d.id);
                              }}
                            >
                              <Trash2Icon className="size-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2.5 rounded-2xl border bg-primary/5 p-5 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <SparklesIcon className="size-4" />
                  Broadcasting Best Practices
                </div>
                <ul className="list-inside list-disc space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <li>
                    High-impact push notifications should have clear, actionable titles under 50
                    characters.
                  </li>
                  <li>
                    For security notices or terms updates, prefer <strong>Email + Push</strong>.
                  </li>
                  <li>
                    Target specific cohorts (e.g. unverified KYC or inactive users) for higher
                    engagement.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── HISTORY TAB ────────────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4 pt-4">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h3 className="text-sm font-bold">Broadcast Records</h3>
                <p className="text-xs text-muted-foreground">
                  History of announcements dispatched across web, mobile push, and email.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void historyQuery.refetch()}
                disabled={historyQuery.isFetching}
                className="gap-1.5 text-xs"
              >
                <RotateCcwIcon
                  className={`size-3.5 ${historyQuery.isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            {historyQuery.isPending ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                Loading broadcast history...
              </div>
            ) : (historyQuery.data?.items.length ?? 0) === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground">
                No broadcasts have been sent yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/50 font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Audience</th>
                      <th className="px-4 py-3">Channel</th>
                      <th className="px-4 py-3 text-right">Recipients</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Sent At</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historyQuery.data?.items.map((b: BroadcastRecord) => (
                      <tr key={b.id} className="transition-colors hover:bg-muted/20">
                        <td className="max-w-xs truncate px-4 py-3.5 font-semibold">
                          <div>{b.title}</div>
                          <div className="max-w-xs truncate text-[11px] font-normal text-muted-foreground">
                            {b.content}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                            {b.audience}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {b.deliveryMethod === "EMAIL_AND_PUSH" ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <MailIcon className="size-3" /> +{" "}
                              <SmartphoneIcon className="size-3" />
                            </span>
                          ) : b.deliveryMethod === "PUSH" ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <SmartphoneIcon className="size-3" /> Push
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <MailIcon className="size-3" /> Email
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono whitespace-nowrap tabular-nums">
                          {b.recipientCount != null ? (
                            <span>
                              {b.recipientCount.toLocaleString()}
                              {b.failedCount ? (
                                <span className="ml-1 text-[10px] text-destructive">
                                  ({b.failedCount} fail)
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Badge
                            tone={
                              b.status === "sent"
                                ? "success"
                                : b.status === "sending"
                                  ? "info"
                                  : "neutral"
                            }
                          >
                            {b.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground">
                          <DateTime value={b.sentAt || b.createdAt} />
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setDeletePendingId(b.id);
                            }}
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalHistoryPages > 1 && (
              <div className="flex items-center justify-between border-t p-3 text-xs">
                <span className="text-muted-foreground">
                  Page {historyPage} of {totalHistoryPages} ({totalHistoryCount} total)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage <= 1}
                    onClick={() => {
                      setHistoryPage((p) => Math.max(1, p - 1));
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= totalHistoryPages}
                    onClick={() => {
                      setHistoryPage((p) => p + 1);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── AUTOMATED TRIGGERS TAB ──────────────────────────────────── */}
        <TabsContent value="automated" className="space-y-4 pt-4">
          <div className="space-y-6 rounded-2xl border bg-card p-6 shadow-xs">
            <div className="flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <ZapIcon className="size-4 text-amber-500" />
                  Automated Engagement Triggers
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Automated background sweeps that notify users based on lifecycle milestones (with
                  24-hour rate limit protection).
                </p>
              </div>

              <Button
                variant="primary"
                size="sm"
                loading={triggeringSweep}
                onClick={() => void handleTriggerSweep()}
                className="gap-1.5"
              >
                <ZapIcon className="size-3.5" />
                Run All Automated Sweeps
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Unfunded Wallet Nudge</span>
                  <Badge tone="info">Active</Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Sends personalized tips and funding instructions to newly registered accounts that
                  haven&apos;t completed their first wallet deposit.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  loading={triggeringSweep}
                  onClick={() => void handleTriggerSweep("WALLET_NOT_FUNDED")}
                >
                  Run Sweep
                </Button>
              </div>

              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">KYC Completion Reminder</span>
                  <Badge tone="info">Active</Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Notifies users stuck on KYC Level 0 about the higher tier limits and instant
                  crypto trading unlocked by quick BVN verification.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  loading={triggeringSweep}
                  onClick={() => void handleTriggerSweep("KYC_REMINDER")}
                >
                  Run Sweep
                </Button>
              </div>

              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Inactive Trader Re-engagement</span>
                  <Badge tone="info">Active</Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Re-engages users who transacted in the past but have been inactive for over 14
                  days with live rate updates and zero fee promos.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  loading={triggeringSweep}
                  onClick={() => void handleTriggerSweep("INACTIVE_14D")}
                >
                  Run Sweep
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Step for Sending Broadcast */}
      <ConfirmActionDialog
        open={confirmSendOpen}
        onOpenChange={setConfirmSendOpen}
        title="Confirm Broadcast Dispatch"
        target={
          <span className="font-semibold text-foreground">
            &quot;{subject}&quot; to {matchedCount.toLocaleString()} recipient(s)
          </span>
        }
        impact={`This will dispatch ${deliveryMethod} notifications to all matched users in the "${audience}" cohort. Delivery is processed asynchronously in rate-limited batches.`}
        confirmLabel="Send Broadcast"
        tone="default"
        onConfirm={async () => {
          await sendMutation.mutateAsync();
        }}
      />

      {/* Confirmation for Deleting Broadcast History */}
      <ConfirmActionDialog
        open={deletePendingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePendingId(null);
        }}
        title="Delete Broadcast History"
        target={<span className="font-mono text-xs">{deletePendingId}</span>}
        impact="This removes the historical broadcast log from the admin console. This action cannot be undone."
        confirmLabel="Delete Record"
        tone="danger"
        onConfirm={async () => {
          if (deletePendingId) {
            await deleteMutation.mutateAsync(deletePendingId);
          }
        }}
      />
    </div>
  );
}
