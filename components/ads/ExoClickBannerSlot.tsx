"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const ZONES = {
  desktop: { zoneId: "5991070", insClass: "eas6a97888e2",  width: 728, height: 90 },
  mobile:  { zoneId: "5991072", insClass: "eas6a97888e10", width: 320, height: 50 },
};

// How long to wait for ExoClick to fill the slot before giving up (ms)
const FILL_TIMEOUT_MS = 3000;
// How often to retry after a failed fill (matches ExoClick's own refresh rate)
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
  width,
  height,
}: {
  zoneId: string;
  insClass: string;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // "loading" → shimmer, "filled" → show ad, "empty" → retry shimmer
  const [state, setState] = useState<"loading" | "filled" | "empty">("loading");
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  const attempt = useCallback(() => {
    const container = ref.current;
    if (!container) return;

    setState("loading");

    // Re-inject a fresh <ins> so ExoClick sees a new element on retry
    container.innerHTML = `<ins class="${insClass}" data-zoneid="${zoneId}"></ins>`;

    // Small delay so the script can register the new element
    const serve = window.setTimeout(pushServe, 200);

    // Check if it filled
    const check = window.setTimeout(() => {
      window.clearTimeout(serve);
      const ins = container.querySelector("ins");
      if (ins && ins.childElementCount > 0) {
        setState("filled");
      } else {
        setState("empty");
        attemptRef.current += 1;
        // Schedule retry
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

  // Never reached on first attempt but keeps layout stable across retries
  if (state === "empty" && attemptRef.current > 0 && retryRef.current === null) return null;

  return (
    <div
      className="flex w-full shrink-0 items-center justify-center bg-[var(--glass-bg)]"
      style={{ height }}
    >
      {state === "loading" && (
        <div
          aria-hidden
          className="animate-pulse rounded bg-navy-100 dark:bg-navy-800/60"
          style={{ width, height: height - 8, borderRadius: 6 }}
        />
      )}
      {/* The actual ad container — always in the DOM so ExoClick can inject into it */}
      <div
        ref={ref}
        aria-label="Advertisement"
        style={{
          width,
          height,
          minHeight: height,
          overflow: "hidden",
          // Hide visually while loading/empty but keep in DOM for injection
          position: state === "loading" ? "absolute" : "static",
          opacity: state === "filled" ? 1 : 0,
          pointerEvents: state === "filled" ? "auto" : "none",
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

  if (isMobile === null) return null;

  const zone = isMobile ? ZONES.mobile : ZONES.desktop;
  return <AdUnit key={zone.zoneId} {...zone} />;
}
