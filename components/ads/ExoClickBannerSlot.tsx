"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NeverBlockZone } from "@/app/api/neverblock/route";

const ZONES = {
  desktop: { zoneId: "5991070", insClass: "eas6a97888e2",  width: 728, height: 90 },
  mobile:  { zoneId: "5991072", insClass: "eas6a97888e10", width: 300, height: 50 },
};

const NO_FILL_RETRY_MS = 45_000;

export function ExoClickBannerSlot() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [nbAd, setNbAd] = useState<NeverBlockZone | null>(null);
  // Tracks whether we've already kicked off the direct script serve call
  const directServedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const fetchNeverBlock = useCallback(async (zoneId: string) => {
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
        setNbAd(zone);
      } else {
        retryTimerRef.current = setTimeout(() => void fetchNeverBlock(zoneId), NO_FILL_RETRY_MS);
      }
    } catch {
      retryTimerRef.current = setTimeout(() => void fetchNeverBlock(zoneId), NO_FILL_RETRY_MS);
    }
  }, []);

  useEffect(() => {
    if (isMobile === null) return;
    const zoneId = isMobile ? ZONES.mobile.zoneId : ZONES.desktop.zoneId;
    setNbAd(null);
    directServedRef.current = false;

    // Fetch NeverBlock first — only fall back to direct script if it doesn't fill
    void fetchNeverBlock(zoneId);

    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, [isMobile, fetchNeverBlock]);

  // Load the direct ExoClick script only when NeverBlock hasn't filled
  // and we haven't already served it this mount cycle
  useEffect(() => {
    if (nbAd !== null) return; // NeverBlock filled — don't load direct script
    if (isMobile === null) return;
    if (directServedRef.current) return;
    directServedRef.current = true;

    const zone = isMobile ? ZONES.mobile : ZONES.desktop;

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

    void zone; // used implicitly via the <ins> tag in the render
  }, [nbAd, isMobile]);

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
      {nbAd?.data.url && nbAd.data.image ? (
        // NeverBlock filled — bypass ad, direct script never loaded
        <a
          href={String(nbAd.data.url)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          style={{ display: "block", lineHeight: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={String(nbAd.data.image)}
            alt="Advertisement"
            width={zone.width}
            height={zone.height}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
        </a>
      ) : (
        // Direct fallback — only rendered when NeverBlock hasn't filled
        <ins className={zone.insClass} data-zoneid={zone.zoneId} />
      )}
    </div>
  );
}
