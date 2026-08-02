"use client";

import Script from "next/script";
import { useId, useEffect, useRef, useState } from "react";

const ZONE_ID   = "5991074";
const INS_CLASS = "eas6a97888e37";

type Props = { zoneId?: string };

export function ExoClickOutstream({ zoneId = ZONE_ID }: Props) {
  const uid = useId();
  const insRef = useRef<HTMLElement | null>(null);
  // "visible" = ad is present; "closed" = ExoClick removed/emptied the ins element
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const ins = insRef.current;
    if (!ins) return;

    // Watch for ExoClick emptying or removing the ins element's children,
    // which is what happens when the user clicks the X on the video ad.
    const observer = new MutationObserver(() => {
      if (ins.childElementCount === 0 && ins.children.length === 0) {
        // Small debounce — ExoClick may momentarily clear then re-inject
        const t = window.setTimeout(() => {
          if (ins.childElementCount === 0) setClosed(true);
        }, 300);
        return () => window.clearTimeout(t);
      }
    });

    observer.observe(ins, { childList: true, subtree: false });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto w-full max-w-sm px-4">
      {/* Label hides when the ad is closed */}
      {!closed && (
        <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-navy-400 dark:text-navy-500">
          Sponsored
        </p>
      )}
      {/* ExoClick embed — exactly as provided by the dashboard.
          The ins element stays in the DOM so the ref remains valid. */}
      <ins
        ref={(el) => { insRef.current = el; }}
        className={INS_CLASS}
        data-zoneid={zoneId}
      />
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
