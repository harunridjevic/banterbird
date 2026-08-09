"use client";

import { useEffect, useRef } from "react";

/** Rotate / refresh IPP this often (midpoint of 3–4 minutes). */
const RELOAD_INTERVAL_MS = 3.5 * 60 * 1000;

/**
 * In-Page Push zone IDs to rotate through.
 * Set NEXT_PUBLIC_MONETAG_IPP_ZONES=id1,id2,id3 after creating extra IPP zones
 * in Monetag (each zone is frequency-capped independently).
 */
const FALLBACK_ZONES = ["11540658"];

const SRC = "https://nap5k.com/tag.min.js";
const BANNER_SELECTOR = '[class^="pl-"]';
const STORAGE_KEY_RE = /zfg|fakepush|pushkin|_shownFake|webpush|snxrchfu|monetag/i;

function readZones(): string[] {
  const fromEnv = process.env.NEXT_PUBLIC_MONETAG_IPP_ZONES;
  if (fromEnv?.trim()) {
    const parsed = fromEnv
      .split(/[,\s]+/)
      .map((z) => z.replace(/[^\d]/g, ""))
      .filter(Boolean);
    if (parsed.length) return parsed;
  }
  return FALLBACK_ZONES;
}

function clearMonetagState() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      store.removeItem("zfgstorage");
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && STORAGE_KEY_RE.test(key)) keys.push(key);
      }
      for (const key of keys) store.removeItem(key);
    } catch {
      /* private mode */
    }
  }

  try {
    const w = window as unknown as Record<string, unknown>;
    for (const key of Object.keys(w)) {
      if (!STORAGE_KEY_RE.test(key) && key !== "_shownFakepushFormats") continue;
      try {
        delete w[key];
      } catch {
        try {
          w[key] = undefined;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  document.querySelectorAll(BANNER_SELECTOR).forEach((el) => el.remove());
}

function removeZoneScripts() {
  document.querySelectorAll<HTMLScriptElement>("script[data-bb-monetag='ipp']").forEach((el) => {
    el.remove();
  });
}

function injectZone(zone: string) {
  const w = window as unknown as {
    fakepushMax?: number;
    fakepushMaxMobile?: number;
  };
  w.fakepushMax = 3;
  w.fakepushMaxMobile = 3;

  removeZoneScripts();

  const s = document.createElement("script");
  s.dataset["bbMonetag"] = "ipp";
  s.dataset["zone"] = zone;
  s.src = SRC;
  s.async = true;
  document.body.appendChild(s);
}

/**
 * Monetag In-Page Push — direct page inject (no overlay iframe).
 * Every RELOAD_INTERVAL_MS clears local frequency state and injects the next
 * zone in the rotation.
 */
export function MonteagBannerSlot() {
  const epochRef = useRef(0);
  const zonesRef = useRef(readZones());

  useEffect(() => {
    const zones = zonesRef.current;
    if (zones.length === 0) return;

    injectZone(zones[0]!);

    const timer = setInterval(() => {
      epochRef.current += 1;
      const zone = zones[epochRef.current % zones.length]!;
      clearMonetagState();
      injectZone(zone);
    }, RELOAD_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      removeZoneScripts();
    };
  }, []);

  return null;
}
