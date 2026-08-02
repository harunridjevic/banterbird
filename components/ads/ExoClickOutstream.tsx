"use client";

import Script from "next/script";
import { useId } from "react";

const ZONE_ID   = "5991074";
const INS_CLASS = "eas6a97888e37";

type Props = { zoneId?: string };

export function ExoClickOutstream({ zoneId = ZONE_ID }: Props) {
  // useId gives a stable-per-instance but unique-across-remounts id so
  // Next.js Script deduplication doesn't suppress the serve push when the
  // component remounts (e.g. after the user closes the ad and starts a new match).
  const uid = useId();

  return (
    <div className="mx-auto w-full max-w-sm px-4">
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-navy-400 dark:text-navy-500">
        Sponsored
      </p>
      {/* ExoClick embed — exactly as provided by the dashboard */}
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
    </div>
  );
}
