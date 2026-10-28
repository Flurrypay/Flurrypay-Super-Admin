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
    title: "Level 1 · BVN",
    description: "BVN verified automatically against the registry.",
  },
  2: {
    title: "Level 2 · NIN",
    description:
      "NIN verified automatically and matched to the BVN names, date of birth and gender.",
  },
  3: {
    title: "Level 3 · Address and live identity",
    description:
      "Proof of address reviewed after a server-verified live capture matches the verified NIN photograph.",
  },
} as const;
