"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import { MonteagVignette } from "@/components/ads/MonteagVignette";
import { useAccount } from "@/lib/account/context";

const MIN_DISPLAY_MS = 2000;

type Props = {
  onCancel: () => void;
  /** When true, show a Monetag vignette before matchmaking begins. */
  showVignette?: boolean;
  /** Called once the vignette has finished (or been skipped) — parent should start matching. */
  onVignetteDone?: () => void;
};

export function MatchingLoader({ onCancel, showVignette = false, onVignetteDone }: Props) {
  const { isPro } = useAccount();
  const [canCancel, setCanCancel] = useState(false);
  const [showVignetteAds, setShowVignetteAds] = useState(false);
  const [vignetteComplete, setVignetteComplete] = useState(!showVignette);
  const mountedAt = useRef(Date.now());
  const onVignetteDoneRef = useRef(onVignetteDone);

  useEffect(() => {
    onVignetteDoneRef.current = onVignetteDone;
  }, [onVignetteDone]);

  useEffect(() => {
    const elapsed = Date.now() - mountedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    const t = window.setTimeout(() => setCanCancel(true), remaining);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (!res.ok) return;
        const data = (await res.json()) as { ads?: { showVignetteAds?: boolean } };
        setShowVignetteAds(data.ads?.showVignetteAds !== false);
      } catch { /* keep hidden on error */ }
    })();
  }, []);

  const handleVignetteDone = useCallback(() => {
    setVignetteComplete(true);
    onVignetteDoneRef.current?.();
  }, []);

  const shouldShowVignette = !isPro && showVignette && showVignetteAds && !vignetteComplete;

  return (
    <div className="w-full px-4 py-6">

      {/* Monetag vignette — fires before matchmaking resumes */}
      {shouldShowVignette && (
        <MonteagVignette onDone={handleVignetteDone} />
      )}

      {/* ── Main content area ──────────────────────────────────────────────────
          Mobile:  stacked, centred
          Desktop: single centred column (outstream removed)                  */}
      <div className="flex flex-col items-center gap-6">

        {/* Matching animation + text */}
        <div className="flex w-full flex-col items-center justify-center text-center">
          <motion.div
            className="relative flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-navy-200/70 bg-white/80 shadow-lg sm:h-24 sm:w-24 sm:rounded-[2rem] dark:border-white/10 dark:bg-navy-900/40"
            animate={{ scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-10 w-10 text-navy-900 sm:h-12 sm:w-12 dark:text-navy-100" />
            <motion.span
              className="absolute inset-0 rounded-[1.75rem] border-2 border-navy-900/20 sm:rounded-[2rem] dark:border-white/20"
              animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.1, 1] }}
              transition={{ duration: 2.1, repeat: Infinity }}
            />
          </motion.div>

          <p className="mt-5 text-base font-semibold text-navy-950 sm:text-lg dark:text-navy-50">
            Looking for a match…
          </p>
          <p className="mt-2 max-w-xs text-sm text-navy-600 dark:text-navy-300">
            Hang tight. We&apos;re pairing you with someone now.
          </p>

          <motion.button
            type="button"
            whileHover={canCancel ? { scale: 1.02 } : {}}
            whileTap={canCancel ? { scale: 0.98 } : {}}
            disabled={!canCancel}
            onClick={canCancel ? onCancel : undefined}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 disabled:opacity-40 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-navy-200"
          >
            <ArrowLeft className="h-4 w-4" /> Cancel
          </motion.button>
        </div>

      </div>

    </div>
  );
}
