import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  ClockIcon,
  HourglassIcon,
} from "lucide-react";

import type { StatusMap } from "@/components/status/status-badge";

import type { KycStatus } from "./api";

export const KYC_STATUS: StatusMap<KycStatus> = {
  NOT_STARTED: {
    label: "Not started",
    tone: "neutral",
    icon: CircleDashedIcon,
    description: "Nothing submitted for this level.",
  },
  PENDING: {
    label: "Awaiting review",
    tone: "warning",
    icon: ClockIcon,
    description: "Submitted and waiting for an administrator decision.",
  },
  VERIFIED: { label: "Verified", tone: "success", icon: CircleCheckIcon, description: "Approved." },
  REJECTED: {
    label: "Rejected",
    tone: "danger",
    icon: CircleXIcon,
    description: "Rejected; the customer sees the reason.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "neutral",
    icon: HourglassIcon,
    description: "Verification lapsed and must be redone.",
  },
};

export const KYC_LEVEL_INFO = {
  1: {
    title: "Level 1 · Identity",
    description: "BVN or NIN matched against the national registry. Verified automatically.",
  },
  2: { title: "Level 2 · Address", description: "Proof of address and address verification." },
  3: {
    title: "Level 3 · Government ID",
    description: "Government ID document, liveness and face match.",
  },
} as const;
