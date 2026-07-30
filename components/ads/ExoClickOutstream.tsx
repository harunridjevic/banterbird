"use client";

/**
 * ExoClickOutstream
 * ─────────────────
 * Renders an ExoClick Outstream Video ad (no video player needed on your site).
 * The <ins> class "eas6a97888e2" is specific to this ExoClick account.
 *
 * HOW TO GET YOUR ZONE ID:
 *   1. ExoClick → Sites & Zones → New Zone → banterbird.app
 *   2. Format category: Video → Outstream → Next
 *   3. Maximum Width: Responsive
 *   4. "Once closed, hide for": Show on every page
 *   5. Save → copy the number from data-zoneid="XXXXXXX"
 *
 * USAGE:
 *   <ExoClickOutstream zoneId="XXXXXXX" />
 */

import { useEffect, useRef } from "react";

const INS_CLASS = "eas6a97888e37";

type Props = {
  zoneId: string;
};

function loadExoClickScript() {
  if (document.querySelector('script[data-exoclick-provider]')) return;
  const s = document.createElement("script");
  s.src = "https://a.magsrv.com/ad-provider.js";
  s.async = true;
  s.setAttribute("data-exoclick-provider", "1");
  document.head.appendChild(s);
}

function serveAds() {
  (
    (window as unknown as Record<string, unknown>).AdProvider as
      | { push: (o: unknown) => void }
      | undefined
  )?.push({ serve: {} });
}

export function ExoClickOutstream({ zoneId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    loadExoClickScript();

    container.innerHTML = "";
    const ins = document.createElement("ins");
    ins.className = INS_CLASS;
    ins.setAttribute("data-zoneid", zoneId);
    container.appendChild(ins);

    const t = window.setTimeout(serveAds, 50);
    return () => {
      window.clearTimeout(t);
      container.innerHTML = "";
    };
  }, [zoneId]);

  return (
    <div className="mx-auto w-full max-w-sm px-4">
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-navy-400 dark:text-navy-500">
        Sponsored
      </p>
      <div
        ref={containerRef}
        aria-label="Advertisement"
        className="overflow-hidden rounded-2xl border border-navy-200/60 bg-white/50 dark:border-white/10 dark:bg-navy-900/30"
        style={{ minHeight: 200 }}
      />
    </div>
  );
}
