"use client";

/**
 * ExoClickBanner
 * ──────────────
 * Renders a single ExoClick async banner zone.
 * Each zone has its own ins class name (found in the generated code snippet).
 *
 * USAGE:
 *   <ExoClickBanner zoneId="5991070" insClass="eas6a97888e2"  width={728} height={90} />
 *   <ExoClickBanner zoneId="5991072" insClass="eas6a97888e10" width={320} height={50} />
 */

import { useEffect, useRef } from "react";

type Props = {
  /** Numeric zone ID — the number from data-zoneid="XXXXXXX" */
  zoneId: string;
  /** The class name on the <ins> tag — from the generated snippet e.g. "eas6a97888e2" */
  insClass: string;
  /** Ad width in pixels */
  width: number;
  /** Ad height in pixels */
  height: number;
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

export function ExoClickBanner({ zoneId, insClass, width, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    loadExoClickScript();

    container.innerHTML = "";
    const ins = document.createElement("ins");
    ins.className = insClass;
    ins.setAttribute("data-zoneid", zoneId);
    container.appendChild(ins);

    const t = window.setTimeout(serveAds, 50);
    return () => window.clearTimeout(t);
  }, [zoneId, insClass]);

  return (
    <div
      aria-label="Advertisement"
      ref={containerRef}
      style={{ width, height, minHeight: height }}
    />
  );
}
