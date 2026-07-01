"use client";

import { useSupabase } from "@/app/providers";
import { useDisplayOnlineCount } from "@/lib/ops/use-display-online-count";

export function OnlineCountPill() {
  const { ready } = useSupabase();
  const count = useDisplayOnlineCount();

  if (!ready) return null;

  return (
    <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-navy-200/80 bg-white/85 px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-sm dark:border-white/10 dark:bg-navy-900/60 dark:text-navy-100 sm:px-3.5 sm:text-sm">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {count} online
    </span>
  );
}
