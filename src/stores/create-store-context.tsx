"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { type StoreApi, useStore } from "zustand";

/**
 * Creates a Zustand store scoped to a React subtree.
 *
 * Module-level stores are shared by every request rendered on the server,
 * which can leak one user's state into another's response. Scoping the store
 * to a provider gives each render its own instance while keeping Zustand's API.
 *
 * @example
 * export const [FiltersProvider, useFilters] = createStoreContext(
 *   (initial: { open: boolean }) =>
 *     createStore<FiltersState>()((set) => ({ ...initial, toggle: () => set((s) => ({ open: !s.open })) })),
 *   "Filters",
 * );
 */
export function createStoreContext<State, InitialState>(
  createStore: (initialState: InitialState) => StoreApi<State>,
  displayName: string,
) {
  const StoreContext = createContext<StoreApi<State> | null>(null);
  StoreContext.displayName = `${displayName}StoreContext`;

  function StoreProvider({
    initialState,
    children,
  }: {
    initialState: InitialState;
    children: ReactNode;
  }) {
    const [store] = useState(() => createStore(initialState));
    return <StoreContext value={store}>{children}</StoreContext>;
  }

  function useStoreContext<Selected>(selector: (state: State) => Selected): Selected {
    const store = useContext(StoreContext);
    if (!store) {
      throw new Error(`use${displayName}Store must be used within ${displayName}StoreProvider`);
    }
    return useStore(store, selector);
  }

  return [StoreProvider, useStoreContext] as const;
}
