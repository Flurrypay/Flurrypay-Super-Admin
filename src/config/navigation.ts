import {
  ArrowLeftRightIcon,
  BarChart3Icon,
  ClipboardListIcon,
  HeadsetIcon,
  HourglassIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PercentIcon,
  ScaleIcon,
  ScanFaceIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Undo2Icon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import type { Route } from "next";

import type { AccessRule } from "@/features/auth/permissions";

export interface NavItem {
  id: string;
  label: string;
  href: Route;
  icon: LucideIcon;
  /** Who sees the entry. The API remains the authority on what they can actually do. */
  access: AccessRule;
  /** Second key of the "G then <key>" navigation shortcut. */
  shortcut: string;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Information architecture. Each module maps to data the API actually exposes
 * (see docs/02-api-map.md); modules without admin-ready endpoints are not listed.
 */
export const navigation: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      {
        id: "overview",
        label: "Overview",
        href: "/",
        icon: LayoutDashboardIcon,
        access: "authenticated",
        shortcut: "d",
        description:
          "What needs attention now: failures, pending work, recent administrator activity.",
      },
      {
        id: "reports",
        label: "Reports",
        href: "/reports",
        icon: BarChart3Icon,
        access: { anyPermission: ["transactions.view", "users.view"] },
        shortcut: "r",
        description: "Transaction outcomes and customer growth per day over a chosen period.",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        id: "transactions",
        label: "Transactions",
        href: "/transactions",
        icon: ArrowLeftRightIcon,
        access: { permission: "transactions.view" },
        shortcut: "t",
        description: "The unified ledger: trades, transfers, bills, deposits and withdrawals.",
      },
      {
        id: "stranded",
        label: "Stranded transfers",
        href: "/operations/stranded",
        icon: HourglassIcon,
        access: { permission: "transactions.view" },
        shortcut: "o",
        description: "Customers debited for transfers that were neither delivered nor returned.",
      },
      {
        id: "reversals",
        label: "Reversals",
        href: "/operations/reversals",
        icon: Undo2Icon,
        access: { superAdmin: true },
        shortcut: "v",
        description: "Failed transactions that may not have returned the customer's money.",
      },
      {
        id: "kyc",
        label: "KYC review",
        href: "/kyc",
        icon: ScanFaceIcon,
        access: { permission: "kyc.review" },
        shortcut: "k",
        description: "Identity verification queue for levels 1–3.",
      },
    ],
  },
  {
    label: "Risk & compliance",
    items: [
      {
        id: "compliance",
        label: "Compliance",
        href: "/compliance",
        icon: ShieldAlertIcon,
        access: { permission: "compliance.review" },
        shortcut: "c",
        description:
          "Monitoring alerts, customer risk profiles and the suspicious activity report register.",
      },
      {
        id: "risk",
        label: "Risk & fraud",
        href: "/risk",
        icon: ScaleIcon,
        access: { permission: "compliance.review" },
        shortcut: "i",
        description:
          "Investigation workspace: cases and queues, why activity was flagged, connected accounts, the internal watchlist, rule performance and engine health.",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        id: "treasury",
        label: "Treasury",
        href: "/treasury",
        icon: LandmarkIcon,
        access: { permission: "treasury.view" },
        shortcut: "f",
        description:
          "Settlement liquidity against customer balances, payout accounts and earnings.",
      },
      {
        id: "rates",
        label: "Rates",
        href: "/rates",
        icon: PercentIcon,
        access: { permission: "settings.manage" },
        shortcut: "x",
        description: "Customer pricing: USD buy and sell rates, markups and the swap fee.",
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        id: "users",
        label: "Users",
        href: "/users",
        icon: UsersIcon,
        access: { permission: "users.view" },
        shortcut: "u",
        description: "Customer accounts, balances, wallets, activity and account controls.",
      },
      {
        id: "support",
        label: "Support",
        href: "/support",
        icon: HeadsetIcon,
        // Visible to anyone who can read customer records: triaging the queue
        // and answering it are different jobs, and the reply box does its own
        // `support.reply` check.
        access: { anyPermission: ["support.reply", "users.view"] },
        shortcut: "h",
        description:
          "Account appeals, contact-us messages and live in-app chat. Replies to the inbox go out as email.",
      },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        id: "audit",
        label: "Audit log",
        href: "/audit",
        icon: ClipboardListIcon,
        access: { permission: "auditLogs.view" },
        shortcut: "a",
        description: "Every recorded administrator action, with IP and context.",
      },
      {
        id: "administrators",
        label: "Administrators",
        href: "/administrators",
        icon: UserCogIcon,
        access: { superAdmin: true },
        shortcut: "m",
        description: "Invite staff, assign roles and permissions, suspend or remove access.",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        id: "security",
        label: "Security",
        href: "/security",
        icon: ShieldCheckIcon,
        access: "authenticated",
        shortcut: "s",
        description: "Your two-factor authentication, transaction PIN and session.",
      },
    ],
  },
];

export const navItems: NavItem[] = navigation.flatMap((group) => group.items);

/** The nav item that owns a pathname (longest matching prefix). */
export function findNavItem(pathname: string): NavItem | undefined {
  return navItems
    .filter((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
