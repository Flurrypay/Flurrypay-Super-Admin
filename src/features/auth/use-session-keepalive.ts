"use client";

import { useEffect, useRef } from "react";

import { refreshSessionToken } from "./api";
import { sessionStore, useSessionState } from "./session";

const REFRESH_WHEN_REMAINING_MS = 15 * 60_000;
const ACTIVE_WITHIN_MS = 15 * 60_000;
const CHECK_EVERY_MS = 60_000;

/**
 * Renews the session shortly before it expires, but only while the admin is
 * actually working. An unattended console is left to expire. The API refuses
 * renewals 12 hours after sign-in, at which point the admin signs in again.
 */
export function useSessionKeepAlive() {
  const { session } = useSessionState();
  const lastActivity = useRef(0);
  const inFlight = useRef(false);
  const refusedFor = useRef<string | null>(null);

  useEffect(() => {
    lastActivity.current = Date.now();
    const mark = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    for (const event of events) window.addEventListener(event, mark, { passive: true });
    return () => {
      for (const event of events) window.removeEventListener(event, mark);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      const current = sessionStore.getState().session;
      if (!current || inFlight.current || refusedFor.current === current.token) return;
      const remaining = current.expiresAt - Date.now();
      const active = Date.now() - lastActivity.current < ACTIVE_WITHIN_MS;
      if (remaining > REFRESH_WHEN_REMAINING_MS || !active) return;

      inFlight.current = true;
      refreshSessionToken()
        .then(({ token }) => {
          sessionStore.start(token);
        })
        .catch(() => {
          // Maximum session age reached or the session ended; don't retry this token.
          refusedFor.current = current.token;
        })
        .finally(() => {
          inFlight.current = false;
        });
    }, CHECK_EVERY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [session]);
}
