"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const ZONES = {
  desktop: { zoneId: "5991070", insClass: "eas6a97888e2",  maxWidth: 728, height: 90 },
  mobile:  { zoneId: "5991072", insClass: "eas6a97888e10", maxWidth: 320, height: 50 },
};

const FILL_TIMEOUT_MS   = 3000;
const RETRY_INTERVAL_MS = 30_000;

function loadExoClickScript() {
  if (document.querySelector('script[data-exoclick-provider]')) return;
  const s = document.createElement("script");
  s.src = "https://a.magsrv.com/ad-provider.js";
  s.async = true;
  s.setAttribute("data-exoclick-provider", "1");
  document.head.appendChild(s);
}

function pushServe() {
  (
    (window as unknown as Record<string, unknown>).AdProvider as
      | { push: (o: unknown) => void }
      | undefined
  )?.push({ serve: {} });
}

function AdUnit({
  zoneId,
  insClass,
  maxWidth,
  height,
}: {
  zoneId: string;
  insClass: string;
  maxWidth: number;
  height: number;
}) {
  // Single ref — always stays in the DOM so ExoClick's injected iframe
  // is never detached when state changes.
  const adRef   = useRef<HTMLDivElement>(null);
  const retryRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const [state, setState] = useState<"loading" | "filled" | "empty">("loading");

  const attempt = useCallback(() => {
    const container = adRef.current;
    if (!container) return;

    setState("loading");

    // Fresh <ins> for each attempt
    container.innerHTML = `<ins class="${insClass}" data-zoneid="${zoneId}"></ins>`;

    const serve = window.setTimeout(pushServe, 200);

    const check = window.setTimeout(() => {
      window.clearTimeout(serve);
      const ins = container.querySelector("ins");
      if (ins && ins.childElementCount > 0) {
        setState("filled");
      } else {
        setState("empty");
        attemptRef.current += 1;
        retryRef.current = window.setTimeout(attempt, RETRY_INTERVAL_MS);
      }
    }, FILL_TIMEOUT_MS);

    return () => {
      window.clearTimeout(serve);
      window.clearTimeout(check);
    };
  }, [zoneId, insClass]);

  useEffect(() => {
    loadExoClickScript();
    const cleanup = attempt();
    return () => {
      cleanup?.();
      if (retryRef.current) window.clearTimeout(retryRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outer visibility: show the bar only when loading (first attempt) or filled.
  // Empty state (retry pending): bar hidden, takes no space.
  const barVisible = state === "filled" || (state === "loading" && attemptRef.current === 0);

  return (
    <>
      {/* The slot wrapper — shown when loading or filled, gone when empty */}
      <div
        className="w-full shrink-0 bg-[var(--glass-bg)]"
        style={{
          height: barVisible ? height : 0,
          overflow: "hidden",
          transition: "height 150ms ease",
        }}
      >
        {/* Shimmer: only on first-ever load, hidden once filled */}
        {state === "loading" && attemptRef.current === 0 && (
          <div className="mx-auto h-full" style={{ maxWidth }}>
            <div
              aria-hidden
              className="mx-2 h-full animate-pulse rounded bg-navy-100 dark:bg-navy-800/60"
            />
          </div>
        )}

        {/* Ad container: single div, always in DOM, opacity controls visibility.
            ExoClick injects an iframe here — we never replace this element. */}
        <div
          ref={adRef}
          aria-label="Advertisement"
          className="mx-auto overflow-hidden"
          style={{
            maxWidth,
            height,
            // Invisible during shimmer phase, fully visible when filled
            opacity: state === "filled" ? 1 : 0,
            position: state === "loading" ? "absolute" : "relative",
          }}
        />
      </div>
    </>
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

  if (isMobile === null) return null;

  const zone = isMobile ? ZONES.mobile : ZONES.desktop;
  return <AdUnit key={zone.zoneId} {...zone} />;
}
