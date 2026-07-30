"use client";

import { useEffect, useRef, useState } from "react";

const ZONE_ID   = "5991074";
const INS_CLASS = "eas6a97888e37";

function loadExoClickScript() {
  if (document.querySelector('script[data-exoclick-provider]')) return;
  const s = document.createElement("script");
  s.src = "https://a.magsrv.com/ad-provider.js";
  s.async = true;
  s.setAttribute("data-exoclick-provider", "1");
  document.head.appendChild(s);
}

type Props = { zoneId?: string };

export function ExoClickOutstream({ zoneId = ZONE_ID }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(true);

  useEffect(() => {
    loadExoClickScript();

    const t = window.setTimeout(() => {
      (
        (window as unknown as Record<string, unknown>).AdProvider as
          | { push: (o: unknown) => void }
          | undefined
      )?.push({ serve: {} });
    }, 200);

    const check = window.setTimeout(() => {
      const ins = containerRef.current?.querySelector("ins");
      if (!ins || ins.childElementCount === 0) {
        setFilled(false);
      }
    }, 3000);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(check);
    };
  }, []);

  if (!filled) return null;

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
        dangerouslySetInnerHTML={{
          __html: `<ins class="${INS_CLASS}" data-zoneid="${zoneId}"></ins>`,
        }}
      />
    </div>
  );
}
