"use client";

import { useSupabase } from "@/app/providers";
import { useOnlineCount } from "@/lib/ops/use-online-count";

export function OnlineCountPill() {
  const { ready } = useSupabase();
  const count = useOnlineCount();

  if (!ready) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-200/80 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-navy-700 shadow-sm dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-200 sm:px-3 sm:text-xs">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {count} online
    </span>
  );
}
