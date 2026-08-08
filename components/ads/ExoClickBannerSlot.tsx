"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NeverBlockZone } from "@/app/api/neverblock/route";

const ZONES = {
  desktop: { zoneId: "5991070", insClass: "eas6a97888e2",  width: 728, height: 90 },
  mobile:  { zoneId: "5991072", insClass: "eas6a97888e10", width: 300, height: 50 },
};

const NO_FILL_RETRY_MS = 45_000;

const CHECKER = {
  backgroundImage: `
    linear-gradient(45deg, rgba(120,130,155,0.13) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(120,130,155,0.13) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(120,130,155,0.13) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(120,130,155,0.13) 75%)
  `,
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
} as const;

export function ExoClickBannerSlot() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [ad, setAd] = useState<NeverBlockZone | null>(null);
  const [adSource, setAdSource] = useState<"pending" | "neverblock" | "direct">("pending");
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directServedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const loadDirectScript = useCallback(() => {
    if (directServedRef.current) return;
    directServedRef.current = true;
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
    try {
      const res = await fetch(`/api/neverblock?zones=${zoneId}`);
      if (!res.ok) throw new Error("not ok");
      const data = (await res.json()) as { zones?: unknown[] };
      const raw = data.zones?.[0];
      // ExoClick returns false (not an object) when there is no fill
      if (raw && typeof raw === "object" && "data" in raw) {
        const nb = raw as NeverBlockZone;
        if (nb.data?.image && nb.data.url) {
          setAd(nb);
          setAdSource("neverblock");
          return;
        }
      }
      // No NeverBlock fill — fall back to direct <ins> script
      setAdSource("direct");
      retryTimerRef.current = setTimeout(() => void fetchAd(zoneId), NO_FILL_RETRY_MS);
    } catch {
      setAdSource("direct");
      retryTimerRef.current = setTimeout(() => void fetchAd(zoneId), NO_FILL_RETRY_MS);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset and fetch when viewport size changes
  useEffect(() => {
    if (isMobile === null) return;
    const zoneId = isMobile ? ZONES.mobile.zoneId : ZONES.desktop.zoneId;
    setAd(null);
    setAdSource("pending");
    directServedRef.current = false;
    void fetchAd(zoneId);
    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, [isMobile, fetchAd]);

  // Fire the serve call AFTER the <ins> is in the DOM — state update renders
  // the <ins> first, then this effect runs and pushes the serve call.
  useEffect(() => {
    if (adSource !== "direct") return;
    loadDirectScript();
  }, [adSource, loadDirectScript]);

  const zone = isMobile === null ? null : isMobile ? ZONES.mobile : ZONES.desktop;
  if (!zone) return null;

  return (
    <div
      className="relative flex w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ height: zone.height, ...CHECKER }}
    >
      {adSource === "neverblock" && ad?.data.url && ad.data.image && (
        <a
          href={String(ad.data.url)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="absolute inset-0 flex items-center justify-center"
          style={{ lineHeight: 0 }}
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

      {adSource === "direct" && (
        <ins className={zone.insClass} data-zoneid={zone.zoneId} />
      )}
    </div>
  );
}
