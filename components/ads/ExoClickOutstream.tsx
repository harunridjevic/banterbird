"use client";

import Script from "next/script";
import { useId, useEffect, useRef, useState } from "react";

const ZONE_ID   = "5991074";
const INS_CLASS = "eas6a97888e37";

type Props = { zoneId?: string; className?: string };

export function ExoClickOutstream({ zoneId = ZONE_ID, className }: Props) {
  const uid = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [closed, setClosed] = useState(false);
  // Track whether the ad has ever had a non-zero height (i.e. actually loaded)
  const everHadHeightRef = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 10) {
          // Ad is visible / loaded
          everHadHeightRef.current = true;
        } else if (everHadHeightRef.current && h === 0) {
          // Ad was visible, now collapsed — user clicked X
          setClosed(true);
          ro.disconnect();
        }
      }
    });

    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={className ?? "mx-auto w-full max-w-sm px-4"}>
      {!closed && (
        <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-navy-400 dark:text-navy-500">
          Sponsored
        </p>
      )}
      {/* Wrap the ins so ResizeObserver tracks the ad's rendered height */}
      <div ref={wrapperRef}>
        <ins
          className={INS_CLASS}
          data-zoneid={zoneId}
        />
      </div>
      <Script
        id={`exoclick-serve-${zoneId}-${uid}`}
        strategy="afterInteractive"
      >{`(AdProvider = window.AdProvider || []).push({"serve": {}});`}</Script>
      <Script
        id="exoclick-provider"
        src="https://a.magsrv.com/ad-provider.js"
        strategy="afterInteractive"
      />
    </div>
  );
}
