"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";

import { CommandPalette } from "@/components/command/command-palette";
import { HelpDialog } from "@/components/help/help-dialog";
import { ProductTour } from "@/components/onboarding/product-tour";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { navigation } from "@/config/navigation";
import { useAdmin } from "@/features/auth/admin-context";
import { canAccess } from "@/features/auth/permissions";
import { useConsoleShortcuts } from "@/hooks/use-console-shortcuts";
import { ConsoleUiProvider, readSidebarCollapsed, useConsoleUi } from "@/stores/console-ui-store";

import { Header } from "./header";
import { BrandMark, Sidebar, SidebarNav } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [initial] = useState(() => ({ sidebarCollapsed: readSidebarCollapsed() }));
  return (
    <ConsoleUiProvider initialState={initial}>
      <Shell>{children}</Shell>
    </ConsoleUiProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  const ui = {
    paletteOpen: useConsoleUi((s) => s.paletteOpen),
    helpOpen: useConsoleUi((s) => s.helpOpen),
    mobileNavOpen: useConsoleUi((s) => s.mobileNavOpen),
    sidebarCollapsed: useConsoleUi((s) => s.sidebarCollapsed),
    tourActive: useConsoleUi((s) => s.tourActive),
    setPaletteOpen: useConsoleUi((s) => s.setPaletteOpen),
    setHelpOpen: useConsoleUi((s) => s.setHelpOpen),
    setMobileNavOpen: useConsoleUi((s) => s.setMobileNavOpen),
    toggleSidebar: useConsoleUi((s) => s.toggleSidebar),
    setTourActive: useConsoleUi((s) => s.setTourActive),
  };

  // Only modules this admin can open appear anywhere in the chrome.
  const groups = useMemo(
    () =>
      navigation
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canAccess(admin, item.access)),
        }))
        .filter((group) => group.items.length > 0),
    [admin],
  );
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const { setPaletteOpen, setHelpOpen, setTourActive } = ui;
  const openPalette = useCallback(() => {
    setPaletteOpen(true);
  }, [setPaletteOpen]);
  const openHelp = useCallback(() => {
    setHelpOpen(true);
  }, [setHelpOpen]);
  const startTour = useCallback(() => {
    setTourActive(true);
  }, [setTourActive]);

  useConsoleShortcuts({ items, onOpenPalette: openPalette, onOpenHelp: openHelp });

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar groups={groups} collapsed={ui.sidebarCollapsed} onToggle={ui.toggleSidebar} />

      <Sheet open={ui.mobileNavOpen} onOpenChange={ui.setMobileNavOpen}>
        <SheetContent className="right-auto left-0 w-72 border-r border-l-0 lg:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Console sections</SheetDescription>
          <div className="flex h-13 items-center border-b px-4">
            <BrandMark />
          </div>
          <div className="overflow-y-auto p-3">
            <SidebarNav
              groups={groups}
              collapsed={false}
              onNavigate={() => {
                ui.setMobileNavOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onStartTour={startTour} />
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 outline-none lg:px-6">
          {children}
        </main>
      </div>

      <CommandPalette
        open={ui.paletteOpen}
        onOpenChange={ui.setPaletteOpen}
        items={items}
        onOpenHelp={openHelp}
      />
      <HelpDialog
        open={ui.helpOpen}
        onOpenChange={ui.setHelpOpen}
        items={items}
        onStartTour={startTour}
      />
      <ProductTour
        adminId={admin.id}
        items={items}
        active={ui.tourActive}
        onActiveChange={ui.setTourActive}
      />
    </div>
  );
}
