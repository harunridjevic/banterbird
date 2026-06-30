"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSupabase } from "@/app/providers";

export function OnlineCountPill() {
  const { client, ready } = useSupabase();
  const [count, setCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (cancelled || !session?.user?.id) return;

      const channel = client.channel("banterbird-online", {
        config: { presence: { key: session.user.id } },
      });
      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, () => {
        setCount(Object.keys(channel.presenceState()).length);
      });

      channel.subscribe(async (status) => {
        if (cancelled || status !== "SUBSCRIBED") return;
        await channel.track({ online_at: new Date().toISOString() });
        const { error } = await client.rpc("heartbeat_presence");
        if (error) console.error("Heartbeat error on subscribe:", error);
      });
    })();

    const heartbeat = setInterval(async () => {
      if (!cancelled) {
        const { error } = await client.rpc("heartbeat_presence");
        if (error) console.error("Heartbeat error on interval:", error);
      }
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) void client.removeChannel(ch);
    };
  }, [client, ready]);

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
