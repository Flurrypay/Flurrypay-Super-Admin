"use client";

import { createStore } from "zustand";

import { createStoreContext } from "./create-store-context";

interface ConsoleUiState {
  paletteOpen: boolean;
  helpOpen: boolean;
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  tourActive: boolean;
  setPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTourActive: (active: boolean) => void;
}

const SIDEBAR_KEY = "fp.console.sidebarCollapsed";

/** Initial sidebar state; read on the client when the console mounts. */
export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

/** Shell UI state for one console instance (dialogs, navigation chrome, tour). */
export const [ConsoleUiProvider, useConsoleUi] = createStoreContext(
  (initial: { sidebarCollapsed: boolean }) =>
    createStore<ConsoleUiState>()((set) => ({
      paletteOpen: false,
      helpOpen: false,
      mobileNavOpen: false,
      sidebarCollapsed: initial.sidebarCollapsed,
      tourActive: false,
      setPaletteOpen: (paletteOpen) => {
        set({ paletteOpen });
      },
      setHelpOpen: (helpOpen) => {
        set({ helpOpen });
      },
      setMobileNavOpen: (mobileNavOpen) => {
        set({ mobileNavOpen });
      },
      toggleSidebar: () => {
        set((state) => {
          const sidebarCollapsed = !state.sidebarCollapsed;
          try {
            window.localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
          } catch {
            // Preference kept for this page view only.
          }
          return { sidebarCollapsed };
        });
      },
      setTourActive: (tourActive) => {
        set({ tourActive });
      },
    })),
  "ConsoleUi",
);
