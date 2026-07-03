"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "offline";

/** Thresholds tuned for full HTTP round-trip, not raw network RTT. */
function qualityFromLatency(ms: number | null): ConnectionQuality {
  if (ms === null) return "offline";
  if (ms < 120) return "excellent";
  if (ms < 280) return "good";
  if (ms < 700) return "fair";
  return "poor";
}

const QUALITY_COLORS: Record<ConnectionQuality, string> = {
  excellent: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
  good: "bg-lime-500",
  fair: "bg-amber-500",
  poor: "bg-rose-500",
  offline: "bg-navy-300 dark:bg-navy-600",
};

const QUALITY_LABELS: Record<ConnectionQuality, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  offline: "Offline",
};

export function ConnectionSignal() {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      setLatencyMs(null);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);

    const ping = async () => {
      if (!navigator.onLine) {
        setLatencyMs(null);
        return;
      }
      const start = performance.now();
      try {
        const res = await fetch("/api/health/ping", { cache: "no-store" });
        if (res.ok) {
          setLatencyMs(Math.round(performance.now() - start));
        } else {
          setLatencyMs(null);
        }
      } catch {
        setLatencyMs(null);
      }
    };

    void ping();
    const interval = window.setInterval(() => void ping(), 20000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
    };
  }, []);

  const quality = online ? qualityFromLatency(latencyMs) : "offline";

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-navy-200/70 bg-white/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap text-navy-600 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-300 sm:px-2 sm:text-[11px]"
      title={latencyMs !== null ? `${QUALITY_LABELS[quality]} · ${latencyMs}ms` : QUALITY_LABELS[quality]}
      aria-label={QUALITY_LABELS[quality]}
    >
      {online ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${QUALITY_COLORS[quality]}`} aria-hidden />
      <span className="hidden sm:inline">{QUALITY_LABELS[quality]}</span>
    </span>
  );
}
