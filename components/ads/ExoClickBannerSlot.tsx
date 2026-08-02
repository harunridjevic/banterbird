"use client";

import Script from "next/script";
import { useState, useEffect } from "react";

const ZONES = {
  desktop: { zoneId: "5991070", insClass: "eas6a97888e2",  width: 728, height: 90 },
  mobile:  { zoneId: "5991072", insClass: "eas6a97888e10", width: 300, height: 50 },
};

export function ExoClickBannerSlot() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isMobile === null) return null;

  const zone = isMobile ? ZONES.mobile : ZONES.desktop;

  return (
    <div
      className="flex w-full shrink-0 items-center justify-center"
      style={{
        minHeight: zone.height,
        // Checkerboard pattern — clearly marks this as an ad zone.
        // Two overlapping linear-gradients form the classic check.
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
      {/* ExoClick embed — exactly as provided by the dashboard */}
      <ins className={zone.insClass} data-zoneid={zone.zoneId} />
      <Script
        id={`exoclick-serve-${zone.zoneId}`}
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
