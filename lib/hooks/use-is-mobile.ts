"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 640;

function getSnapshot() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

// Server snapshot: false = assume desktop so no <br> appears during SSR/hydration
function getServerSnapshot() {
  return false;
}

let listeners: (() => void)[] = [];

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};

  if (listeners.length === 0) {
    // resize covers normal window resizing and DevTools emulation toggle
    window.addEventListener("resize", notify);
    // orientationchange covers physical device rotation
    window.addEventListener("orientationchange", notify);
    // visibilitychange re-checks when the user switches back to the tab after
    // toggling DevTools device mode, which doesn't always fire resize
    document.addEventListener("visibilitychange", notify);
  }

  listeners.push(cb);

  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (listeners.length === 0) {
      window.removeEventListener("resize", notify);
      window.removeEventListener("orientationchange", notify);
      document.removeEventListener("visibilitychange", notify);
    }
  };
}

/**
 * Returns `true` when `window.innerWidth < 640px` (Tailwind `sm` breakpoint).
 *
 * Listens to resize + orientationchange + visibilitychange so it correctly
 * updates when DevTools device emulation is toggled on or off.
 *
 * Server snapshot returns `false` (desktop) to prevent a line-break flash
 * on desktop during SSR → hydration.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
