"use client";

import { useEffect } from "react";

const ZONE = "11540658";
const SRC = "https://nap5k.com/tag.min.js";

/**
 * How often to re-inject the Monetag In-Page Push script (ms).
 * The widget is a SPA so it never naturally reloads — we remove the old
 * script tag and inject a fresh one at this interval so dismissed ads
 * reappear at a reasonable cadence.
 * 4 minutes is a good balance between revenue and UX.
 */
const REINJECT_INTERVAL_MS = 4 * 60 * 1000;

function injectScript() {
  // Remove any previous instance so Monetag re-initialises cleanly.
  const old = document.querySelector<HTMLScriptElement>(`script[data-zone="${ZONE}"]`);
  if (old) old.remove();

  const s = document.createElement("script");
  s.dataset["zone"] = ZONE;
  s.src = SRC;
  s.async = true;
  document.body.appendChild(s);
}

/**
 * Monetag In-Page Push banner — zone 11540658.
 * Injects on mount, then re-injects every REINJECT_INTERVAL_MS so the ad
 * reappears after dismiss in a single-page app that never does a full reload.
 */
export function MonteagBannerSlot() {
  useEffect(() => {
    injectScript();

    const timer = setInterval(injectScript, REINJECT_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return null;
}
