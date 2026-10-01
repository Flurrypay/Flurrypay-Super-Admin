"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { findNavItem, type NavGroup } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}

export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md outline-offset-4">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
      >
        F
      </span>
      {!collapsed && (
        <span className="truncate text-sm font-semibold tracking-tight">{siteConfig.name}</span>
      )}
    </Link>
  );
}

/** Grouped navigation, filtered to what the signed-in admin can access. */
export function SidebarNav({ groups, collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const active = findNavItem(pathname);

  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {collapsed ? (
            <span className="mx-auto mb-1 h-px w-5 bg-border" aria-hidden />
          ) : (
            <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const isActive = active?.id === item.id;
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                data-tour={`nav-${item.id}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {collapsed ? (
                  <span className="sr-only">{item.label}</span>
                ) : (
                  <span className="truncate">{item.label}</span>
                )}
              </Link>
            );
            if (!collapsed) return <div key={item.id}>{link}</div>;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-2">
                  {item.label}
                  <span className="flex gap-0.5">
                    <Kbd>G</Kbd>
                    <Kbd>{item.shortcut.toUpperCase()}</Kbd>
                  </span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({
  groups,
  collapsed,
  onToggle,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      data-tour="sidebar"
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card transition-[width] duration-150 lg:flex",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex h-13 items-center border-b", collapsed ? "justify-center" : "px-4")}>
        <BrandMark collapsed={collapsed} />
      </div>
      <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        <SidebarNav groups={groups} collapsed={collapsed} />
      </div>
      <div className={cn("border-t p-2", !collapsed && "px-3")}>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpenIcon className="size-4" aria-hidden />
          ) : (
            <>
              <PanelLeftCloseIcon className="size-4" aria-hidden />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
