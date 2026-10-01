"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import type { NavItem } from "@/config/navigation";

interface ShortcutOptions {
  items: readonly NavItem[];
  onOpenPalette: () => void;
  onOpenHelp: () => void;
}

const SEQUENCE_TIMEOUT_MS = 1200;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.getAttribute("role") === "combobox"
  );
}

/**
 * Console-wide keyboard shortcuts:
 * ⌘K / Ctrl+K search · "G" then a letter to navigate · "?" for help.
 * Letter shortcuts are ignored while typing in a field or when a dialog is open.
 */
export function useConsoleShortcuts({ items, onOpenPalette, onOpenHelp }: ShortcutOptions) {
  const router = useRouter();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    function clearPending() {
      if (pendingG.current !== null) window.clearTimeout(pendingG.current);
      pendingG.current = null;
    }

    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target) || document.querySelector("[role=dialog]")) return;

      const key = event.key.toLowerCase();
      if (pendingG.current !== null) {
        clearPending();
        const item = items.find((candidate) => candidate.shortcut === key);
        if (item) {
          event.preventDefault();
          router.push(item.href);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = window.setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        onOpenHelp();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPending();
    };
  }, [items, onOpenPalette, onOpenHelp, router]);
}
