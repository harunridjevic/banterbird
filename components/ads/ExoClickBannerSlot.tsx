"use client";

/**
 * ExoClickBannerSlot
 * ──────────────────
 * Renders the correct banner size for the current screen width and
 * disappears completely (no empty space) if ExoClick has no ad to show.
 *
 * Desktop: 728×90  zone 5991070
 * Mobile:  320×50  zone 5991072
 */

import { useEffect, useRef, useState } from "react";

const ZONES = {
  desktop: { zoneId: "5991070", insClass: "eas6a97888e2",  width: 728, height: 90 },
  mobile:  { zoneId: "5991072", insClass: "eas6a97888e10", width: 320, height: 50 },
};

function loadExoClickScript() {
  if (document.querySelector('script[data-exoclick-provider]')) return;
  const s = document.createElement("script");
  s.src = "https://a.magsrv.com/ad-provider.js";
  s.async = true;
  s.setAttribute("data-exoclick-provider", "1");
  document.head.appendChild(s);
}

function AdUnit({
  zoneId,
  insClass,
  width,
  height,
}: {
  zoneId: string;
  insClass: string;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(true);

  useEffect(() => {
    loadExoClickScript();

    const serve = window.setTimeout(() => {
      (
        (window as unknown as Record<string, unknown>).AdProvider as
          | { push: (o: unknown) => void }
          | undefined
      )?.push({ serve: {} });
    }, 200);

    // Hide slot if nothing filled after 3 seconds
    const check = window.setTimeout(() => {
      const ins = ref.current?.querySelector("ins");
      if (!ins || ins.childElementCount === 0) setFilled(false);
    }, 3000);

    return () => {
      window.clearTimeout(serve);
      window.clearTimeout(check);
    };
  }, []);

  if (!filled) return null;

  return (
    <div className="flex w-full shrink-0 items-center justify-center bg-[var(--glass-bg)]">
      <div
        ref={ref}
        aria-label="Advertisement"
        style={{ width, height, minHeight: height, overflow: "hidden" }}
        dangerouslySetInnerHTML={{
          __html: `<ins class="${insClass}" data-zoneid="${zoneId}"></ins>`,
        }}
      />
    </div>
  );
}

export function ExoClickBannerSlot() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Don't render anything during SSR or before we know the screen size
  if (isMobile === null) return null;

  const zone = isMobile ? ZONES.mobile : ZONES.desktop;
  return <AdUnit key={zone.zoneId} {...zone} />;
}
