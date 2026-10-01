"use client";

import { useSyncExternalStore } from "react";

/**
 * Admin session token storage.
 *
 * The API authenticates admins with a bearer JWT that browser code must attach,
 * so the token cannot be HttpOnly. It is kept in sessionStorage — scoped to one
 * tab and discarded when the tab closes — never in localStorage, and the strict
 * nonce CSP limits script injection. Staff sessions are additionally bound to
 * the API's HttpOnly `admin_device` cookie.
 */

const STORAGE_KEY = "fp.admin.session";

export type SessionEndReason = "expired" | "terminated" | "device" | "suspended" | "signed-out";

export interface Session {
  token: string;
  /** Epoch milliseconds, from the JWT `exp` claim. */
  expiresAt: number;
}

interface SessionState {
  session: Session | null;
  endReason: SessionEndReason | null;
}

let state: SessionState = { session: null, endReason: null };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Reads `exp` from a JWT payload. The signature is not (and cannot be) verified client-side. */
export function readTokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Partial<Session>;
    if (typeof stored.token === "string" && typeof stored.expiresAt === "number") {
      state =
        stored.expiresAt > Date.now()
          ? { session: { token: stored.token, expiresAt: stored.expiresAt }, endReason: null }
          : { session: null, endReason: "expired" };
    }
  } catch {
    // Storage unavailable (private mode, blocked site data): the session lives in memory only.
  }
}

function persist(session: Session | null) {
  try {
    if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // See hydrate().
  }
}

export const sessionStore = {
  getState: (): SessionState => {
    hydrate();
    return state;
  },

  getToken: (): string | null => {
    const { session } = sessionStore.getState();
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessionStore.end("expired");
      return null;
    }
    return session.token;
  },

  start: (token: string) => {
    const expiresAt = readTokenExpiry(token) ?? Date.now() + 2 * 60 * 60 * 1000;
    const session = { token, expiresAt };
    persist(session);
    state = { session, endReason: null };
    emit();
  },

  end: (reason: SessionEndReason) => {
    hydrate();
    if (!state.session && state.endReason === reason) return;
    persist(null);
    state = { session: null, endReason: reason };
    emit();
  },

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const SERVER_STATE: SessionState = { session: null, endReason: null };

const noopSubscribe = () => () => undefined;

/**
 * False during server rendering and hydration, true afterwards. Session
 * decisions (redirects) must wait for it: while hydrating, React renders with
 * the server snapshot, which never has a session.
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function useSessionState(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, () => SERVER_STATE);
}
