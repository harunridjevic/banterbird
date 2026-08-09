"use client";

import { useEffect } from "react";

const ZONE = "11540658";
const SRC = "https://nap5k.com/tag.min.js";

/**
 * How often to re-inject the Monetag In-Page Push script (ms).
 * 3 minutes — after a user closes a notification it will reappear at this cadence.
 */
const REINJECT_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Maximum number of In-Page Push notifications visible at the same time.
 * Monetag honours this via the `inLimitPerPage` window config key.
 */
const MAX_BANNERS = 3;

function injectScript() {
  // Configure Monetag before injecting so the widget picks up the limit.
  // The `inLimitPerPage` key is the Monetag In-Page Push per-page cap.
  // @ts-expect-error — Monetag global config on window
  window.monetag_in_page_config = {
    // eslint-disable-next-line camelcase
    inLimitPerPage: MAX_BANNERS,
  };

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
 * Capped at MAX_BANNERS visible notifications at once.
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
