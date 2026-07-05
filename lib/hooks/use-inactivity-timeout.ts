"use client";

import { useCallback, useEffect, useRef } from "react";

const INACTIVITY_MS = 60_000;

/** Calls onIdle after ms without pointer, keyboard, touch, or scroll activity. */
export function useInactivityTimeout(onIdle: () => void, enabled: boolean, timeoutMs = INACTIVITY_MS) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const bumpActivity = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled) return;
    timerRef.current = setTimeout(() => onIdleRef.current(), timeoutMs);
  }, [enabled, timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    bumpActivity();
    for (const event of events) {
      window.addEventListener(event, bumpActivity, { passive: true });
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        return;
      }
      bumpActivity();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of events) {
        window.removeEventListener(event, bumpActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, bumpActivity]);

  return { bumpActivity };
}
