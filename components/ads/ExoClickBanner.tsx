"use client";

import { useEffect } from "react";

type Props = {
  zoneId: string;
  insClass: string;
  width: number;
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

export function ExoClickBanner({ zoneId, insClass, width, height }: Props) {
  useEffect(() => {
    loadExoClickScript();
    // Push serve after script has had time to initialise
    const t = window.setTimeout(() => {
      (
        (window as unknown as Record<string, unknown>).AdProvider as
          | { push: (o: unknown) => void }
          | undefined
      )?.push({ serve: {} });
    }, 200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      aria-label="Advertisement"
      style={{ width, height, minHeight: height, overflow: "hidden" }}
      // The <ins> tag must be in the DOM before the script runs —
      // dangerouslySetInnerHTML puts it there at render time, not after a JS tick.
      dangerouslySetInnerHTML={{
        __html: `<ins class="${insClass}" data-zoneid="${zoneId}"></ins>`,
      }}
    />
  );
}
