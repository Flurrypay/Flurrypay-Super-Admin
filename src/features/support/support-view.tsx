"use client";

import { InboxIcon, MessagesSquareIcon } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { SUPPORT_FILTERS, SUPPORT_TYPES } from "./api";
import { ChatPanel } from "./chat-panel";
import { InboxPanel } from "./inbox-panel";

const TABS = ["inbox", "chat"] as const;

/**
 * Both ways a customer reaches support, in one place.
 *
 * They are genuinely different channels rather than two views of one list: the
 * inbox is email correspondence with people who often cannot sign in (which is
 * usually why they wrote), and chat is an in-app conversation with someone who
 * is signed in right now. Merging them would mean a reply box that sometimes
 * sends an email and sometimes does not, which is the kind of ambiguity support
 * tooling cannot afford.
 */
export function SupportView() {
  const [state, setState] = useQueryStates(
    {
      tab: parseAsStringLiteral(TABS).withDefault("inbox"),
      page: parseAsInteger.withDefault(1),
      size: parseAsInteger.withDefault(25),
      status: parseAsStringLiteral(SUPPORT_FILTERS),
      kind: parseAsStringLiteral(SUPPORT_TYPES),
      // Deep-link targets, set by the notification bell.
      message: parseAsString,
      room: parseAsString,
    },
    { clearOnDefault: true },
  );

  return (
    <Tabs
      value={state.tab}
      onValueChange={(tab) =>
        void setState({
          tab: tab as (typeof TABS)[number],
          // Clear the other tab's open item: leaving it in the URL would reopen a
          // thread the admin closed by switching away from it.
          message: tab === "inbox" ? state.message : null,
          room: tab === "chat" ? state.room : null,
        })
      }
    >
      <TabsList>
        <TabsTrigger value="inbox">
          <InboxIcon aria-hidden />
          Inbox
        </TabsTrigger>
        <TabsTrigger value="chat">
          <MessagesSquareIcon aria-hidden />
          Live chat
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inbox">
        <InboxPanel state={state} setState={setState} />
      </TabsContent>
      <TabsContent value="chat">
        <ChatPanel state={state} setState={setState} />
      </TabsContent>
    </Tabs>
  );
}
