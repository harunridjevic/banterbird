"use client";

import Script from "next/script";
import { useId, useEffect, useRef, useState, useCallback } from "react";
import type { NeverBlockZone } from "@/app/api/neverblock/route";

const ZONE_ID    = "5991074";
const INS_CLASS  = "eas6a97888e37";
const FALLBACK_ZONE_IDS = ["5991070", "5991072"];
const NO_FILL_RETRY_MS  = 45_000;
const NEVERBLOCK_TIMEOUT_MS = 800;

type Props = { zoneId?: string; className?: string };

export function ExoClickOutstream({ zoneId = ZONE_ID, className }: Props) {
  const uid = useId();
  const [ad, setAd] = useState<NeverBlockZone | null>(null);
  const [closed, setClosed] = useState(false);
  const [mode, setMode] = useState<"neverblock" | "direct">("neverblock");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const everHadHeightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAd = useCallback(async (id: string, fallbackIndex = 0) => {
    if (retryTimerRef.current !== null) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (fallbackTimerRef.current !== null) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }

    // Fallback to direct <ins> if NeverBlock doesn't fill in time
    fallbackTimerRef.current = setTimeout(() => {
      setMode("direct");
    }, NEVERBLOCK_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/neverblock?zones=${id}`);
      if (!res.ok) throw new Error("not ok");
      const data = (await res.json()) as { zones?: NeverBlockZone[] };
      const zone = data.zones?.[0];

      if (zone?.data && (zone.data.image ?? zone.data.url ?? zone.data.embed_url ?? zone.data.vast_url)) {
        if (fallbackTimerRef.current !== null) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
        setMode("neverblock");
        setAd(zone);
        return;
      }

      // No fill — try next fallback zone
      const nextFallback = FALLBACK_ZONE_IDS[fallbackIndex];
      if (nextFallback) {
        void fetchAd(nextFallback, fallbackIndex + 1);
      } else {
        retryTimerRef.current = setTimeout(() => void fetchAd(zoneId, 0), NO_FILL_RETRY_MS);
      }
    } catch {
      retryTimerRef.current = setTimeout(() => void fetchAd(zoneId, 0), NO_FILL_RETRY_MS);
    }
  }, [zoneId]);

  useEffect(() => {
    void fetchAd(zoneId);
    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
      if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
    };
  }, [fetchAd, zoneId]);

  // Detect collapse (user closed the ad)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 10) everHadHeightRef.current = true;
        else if (everHadHeightRef.current && h === 0) { setClosed(true); ro.disconnect(); }
      }
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [ad, mode]);

  if (closed) return null;

  const { url, image } = ad?.data ?? {};
  const embedUrl = (ad?.data.embed_url ?? ad?.data.vast_url) as string | undefined;

  return (
    <div className={className ?? "mx-auto w-full max-w-sm px-4"}>
      {(ad || mode === "direct") && (
        <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-navy-400 dark:text-navy-500">
          Sponsored
        </p>
      )}

      <div ref={wrapperRef}>
        {/* NeverBlock — banner image fill */}
        {mode === "neverblock" && image && url && (
          <a
            href={String(url)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ display: "block", lineHeight: 0 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={String(image)}
              alt="Advertisement"
              style={{ display: "block", maxWidth: "100%", height: "auto" }}
            />
          </a>
        )}

        {/* NeverBlock — video/embed fill */}
        {mode === "neverblock" && !image && embedUrl && (
          <iframe
            src={embedUrl}
            style={{ width: "100%", border: "none", minHeight: 250 }}
            allow="autoplay; encrypted-media"
            sandbox="allow-scripts allow-same-origin allow-popups"
            title="Advertisement"
          />
        )}

        {/* Direct fallback — original <ins> script method */}
        {mode === "direct" && (
          <>
            <ins className={INS_CLASS} data-zoneid={zoneId} />
            <Script
              id={`exoclick-serve-${zoneId}-${uid}`}
              strategy="afterInteractive"
            >{`(AdProvider = window.AdProvider || []).push({"serve": {}});`}</Script>
            <Script
              id="exoclick-provider"
              src="https://a.magsrv.com/ad-provider.js"
              strategy="afterInteractive"
            />
          </>
        )}
      </div>
    </div>
  );
}
