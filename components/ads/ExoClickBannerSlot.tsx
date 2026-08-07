"use client";

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

  useEffect(() => {
    if (isMobile === null) return;

    // Load provider script once
    if (!document.getElementById("exoclick-provider")) {
      const s = document.createElement("script");
      s.id = "exoclick-provider";
      s.async = true;
      s.src = "https://a.magsrv.com/ad-provider.js";
      document.body.appendChild(s);
    }

    // Always push a fresh serve call so the ad loads even after re-mount
    (window as unknown as { AdProvider?: unknown[] }).AdProvider =
      (window as unknown as { AdProvider?: unknown[] }).AdProvider ?? [];
    (window as unknown as { AdProvider: unknown[] }).AdProvider.push({ serve: {} });
  }, [isMobile]);

  if (isMobile === null) return null;

  const zone = isMobile ? ZONES.mobile : ZONES.desktop;

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
      <ins className={zone.insClass} data-zoneid={zone.zoneId} />
    </div>
  );
}
