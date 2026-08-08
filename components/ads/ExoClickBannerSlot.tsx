"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NeverBlockZone } from "@/app/api/neverblock/route";

const ZONES = {
  desktop: { zoneId: "5991070", insClass: "eas6a97888e2",  width: 728, height: 90 },
  mobile:  { zoneId: "5991072", insClass: "eas6a97888e10", width: 300, height: 50 },
};

const NO_FILL_RETRY_MS = 45_000;
// How long to wait for NeverBlock before falling back to direct script
const NEVERBLOCK_TIMEOUT_MS = 800;

export function ExoClickBannerSlot() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [ad, setAd] = useState<NeverBlockZone | null>(null);
  // "neverblock" = waiting/showing NB ad | "direct" = fallback to <ins> script
  const [mode, setMode] = useState<"neverblock" | "direct">("neverblock");
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const loadDirectScript = useCallback(() => {
    if (!document.getElementById("exoclick-provider")) {
      const s = document.createElement("script");
      s.id = "exoclick-provider";
      s.async = true;
      s.src = "https://a.magsrv.com/ad-provider.js";
      document.body.appendChild(s);
    }
    (window as unknown as { AdProvider?: unknown[] }).AdProvider =
      (window as unknown as { AdProvider?: unknown[] }).AdProvider ?? [];
    (window as unknown as { AdProvider: unknown[] }).AdProvider.push({ serve: {} });
  }, []);

  const fetchAd = useCallback(async (zoneId: string) => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    // Start fallback timer — if NeverBlock doesn't fill within timeout, use direct
    fallbackTimerRef.current = setTimeout(() => {
      setMode("direct");
      loadDirectScript();
    }, NEVERBLOCK_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/neverblock?zones=${zoneId}`);
      if (!res.ok) throw new Error("not ok");
      const data = (await res.json()) as { zones?: NeverBlockZone[] };
      const zone = data.zones?.[0];
      if (zone?.data?.image && zone.data.url) {
        // NeverBlock filled — cancel fallback
        if (fallbackTimerRef.current !== null) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        setMode("neverblock");
        setAd(zone);
      } else {
        // No fill — fallback timer will fire, also schedule retry
        retryTimerRef.current = setTimeout(() => void fetchAd(zoneId), NO_FILL_RETRY_MS);
      }
    } catch {
      retryTimerRef.current = setTimeout(() => void fetchAd(zoneId), NO_FILL_RETRY_MS);
    }
  }, [loadDirectScript]);

  useEffect(() => {
    if (isMobile === null) return;
    const zoneId = isMobile ? ZONES.mobile.zoneId : ZONES.desktop.zoneId;
    setAd(null);
    setMode("neverblock");
    void fetchAd(zoneId);
    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
      if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
    };
  }, [isMobile, fetchAd]);

  const zone = isMobile === null ? null : isMobile ? ZONES.mobile : ZONES.desktop;
  if (!zone) return null;

  return (
    <div
      className="flex w-full shrink-0 items-center justify-center"
      style={{
        minHeight: zone.height,
        backgroundImage: `
          linear-gradient(45deg, rgba(120,130,155,0.13) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(120,130,155,0.13) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(120,130,155,0.13) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(120,130,155,0.13) 75%)
        `,
        backgroundSize: "12px 12px",
        backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
      }}
    >
      {/* NeverBlock ad — rendered when API fills */}
      {mode === "neverblock" && ad?.data.url && ad.data.image && (
        <a
          href={String(ad.data.url)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          style={{ display: "block", lineHeight: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={String(ad.data.image)}
            alt="Advertisement"
            width={zone.width}
            height={zone.height}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
        </a>
      )}

      {/* Direct fallback — original <ins> tag method when NeverBlock has no fill */}
      {mode === "direct" && (
        <ins className={zone.insClass} data-zoneid={zone.zoneId} />
      )}
    </div>
  );
}
