"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NeverBlockZone } from "@/app/api/neverblock/route";

const ZONES = {
  desktop: { zoneId: "5991070", width: 728, height: 90 },
  mobile:  { zoneId: "5991072", width: 300, height: 50 },
};

const NO_FILL_RETRY_MS = 45_000;

export function ExoClickBannerSlot() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [ad, setAd] = useState<NeverBlockZone | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const fetchAd = useCallback(async (zoneId: string) => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    try {
      const res = await fetch(`/api/neverblock?zones=${zoneId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { zones?: NeverBlockZone[] };
      const zone = data.zones?.[0];
      if (zone?.data?.image && zone.data.url) {
        setAd(zone);
      } else {
        retryTimerRef.current = setTimeout(() => void fetchAd(zoneId), NO_FILL_RETRY_MS);
      }
    } catch {
      retryTimerRef.current = setTimeout(() => void fetchAd(zoneId), NO_FILL_RETRY_MS);
    }
  }, []);

  useEffect(() => {
    if (isMobile === null) return;
    const zoneId = isMobile ? ZONES.mobile.zoneId : ZONES.desktop.zoneId;
    setAd(null);
    void fetchAd(zoneId);
    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, [isMobile, fetchAd]);

  const zone = isMobile === null ? null : isMobile ? ZONES.mobile : ZONES.desktop;
  if (!zone) return null;

  return (
    <div
      className="flex w-full shrink-0 items-center justify-center"
      style={{
        minHeight: zone.height,
        backgroundImage: ad ? undefined : `
          linear-gradient(45deg, rgba(120,130,155,0.13) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(120,130,155,0.13) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(120,130,155,0.13) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(120,130,155,0.13) 75%)
        `,
        backgroundSize: "12px 12px",
        backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
      }}
    >
      {ad?.data.url && ad.data.image && (
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
    </div>
  );
}
