"use client";

import Script from "next/script";
import { useId, useEffect, useRef, useState, useCallback } from "react";
import type { NeverBlockZone } from "@/app/api/neverblock/route";

const ZONE_ID   = "5991074";
const INS_CLASS = "eas6a97888e37";
// No banner fallback zones — the top banner slot already covers those.
// If the outstream video zone has no fill, render nothing rather than
// duplicating the banner that's already shown at the top of the page.
const NO_FILL_RETRY_MS  = 45_000;

type Props = { zoneId?: string; className?: string };

export function ExoClickOutstream({ zoneId = ZONE_ID, className }: Props) {
  const uid = useId();
  const [nbAd, setNbAd] = useState<NeverBlockZone | null>(null);
  const [closed, setClosed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const everHadHeightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNeverBlock = useCallback(async (id: string) => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    try {
      const res = await fetch(`/api/neverblock?zones=${id}`);
      if (!res.ok) throw new Error("not ok");
      const data = (await res.json()) as { zones?: NeverBlockZone[] };
      const zone = data.zones?.[0];
      if (zone?.data && (zone.data.image ?? zone.data.url ?? zone.data.embed_url ?? zone.data.vast_url)) {
        setNbAd(zone);
        return;
      }
      // No fill on the outstream zone — retry later, don't fall back to banner zones
      retryTimerRef.current = setTimeout(() => void fetchNeverBlock(zoneId), NO_FILL_RETRY_MS);
    } catch {
      retryTimerRef.current = setTimeout(() => void fetchNeverBlock(zoneId), NO_FILL_RETRY_MS);
    }
  }, [zoneId]);

  useEffect(() => {
    // Fetch NeverBlock in parallel — direct <ins> renders immediately below
    void fetchNeverBlock(zoneId);
    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, [fetchNeverBlock, zoneId]);

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
  }, [nbAd]);

  if (closed) return null;

  const { url, image } = nbAd?.data ?? {};
  const embedUrl = (nbAd?.data.embed_url ?? nbAd?.data.vast_url) as string | undefined;

  return (
    <div className={className ?? "mx-auto w-full max-w-sm px-4"}>
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-navy-400 dark:text-navy-500">
        Sponsored
      </p>

      <div ref={wrapperRef}>
        {nbAd && image && url ? (
          // NeverBlock banner fill
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
        ) : nbAd && embedUrl ? (
          // NeverBlock video/embed fill
          <iframe
            src={embedUrl}
            style={{ width: "100%", border: "none", minHeight: 250 }}
            allow="autoplay; encrypted-media"
            sandbox="allow-scripts allow-same-origin allow-popups"
            title="Advertisement"
          />
        ) : (
          // Direct fallback — renders immediately, replaced when NeverBlock fills
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
