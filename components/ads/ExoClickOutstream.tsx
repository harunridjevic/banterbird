"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const ZONE_ID    = "5991074";
const INS_CLASS  = "eas6a97888e37";
const FILL_TIMEOUT_MS  = 3000;
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

type Props = { zoneId?: string };

export function ExoClickOutstream({ zoneId = ZONE_ID }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<number | null>(null);
  const [state, setState] = useState<"loading" | "filled" | "empty">("loading");

  const attempt = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    setState("loading");
    container.innerHTML = `<ins class="${INS_CLASS}" data-zoneid="${zoneId}"></ins>`;

    const serve = window.setTimeout(pushServe, 200);

    const check = window.setTimeout(() => {
      window.clearTimeout(serve);
      const ins = container.querySelector("ins");
      if (ins && ins.childElementCount > 0) {
        setState("filled");
      } else {
        setState("empty");
        retryRef.current = window.setTimeout(attempt, RETRY_INTERVAL_MS);
      }
    }, FILL_TIMEOUT_MS);

    return () => {
      window.clearTimeout(serve);
      window.clearTimeout(check);
    };
  }, [zoneId]);

  useEffect(() => {
    loadExoClickScript();
    const cleanup = attempt();
    return () => {
      cleanup?.();
      if (retryRef.current) window.clearTimeout(retryRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Completely hidden when empty and no retry pending
  if (state === "empty" && !retryRef.current) return null;

  return (
    <div className="mx-auto w-full max-w-sm px-4">
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-navy-400 dark:text-navy-500">
        Sponsored
      </p>

      {/* Shimmer shown while loading or retrying */}
      {state === "loading" && (
        <div
          aria-hidden
          className="animate-pulse rounded-2xl bg-navy-100 dark:bg-navy-800/60"
          style={{ height: 200 }}
        />
      )}

      {/* Ad container — always in DOM so ExoClick can inject, hidden until filled */}
      <div
        ref={containerRef}
        aria-label="Advertisement"
        className="overflow-hidden rounded-2xl border border-navy-200/60 bg-white/50 dark:border-white/10 dark:bg-navy-900/30"
        style={{
          minHeight: state === "filled" ? 200 : 0,
          height: state === "filled" ? "auto" : 0,
          opacity: state === "filled" ? 1 : 0,
          pointerEvents: state === "filled" ? "auto" : "none",
        }}
      />
    </div>
  );
}
