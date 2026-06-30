"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSupabase } from "@/app/providers";
import { tabCloseFetch } from "@/lib/presence/tab-close-fetch";

type OnlinePresenceCtx = {
  onlineCount: number;
};

const OnlinePresenceContext = createContext<OnlinePresenceCtx>({ onlineCount: 0 });

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { client, ready } = useSupabase();
  const [onlineCount, setOnlineCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    leavingRef.current = false;

    const leaveOnline = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;

      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        void ch.untrack();
        void client.removeChannel(ch);
      }
      tabCloseFetch("/api/presence/leave");
    };

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
        if (!cancelled) setOnlineCount(Object.keys(channel.presenceState()).length);
      });
      channel.on("presence", { event: "join" }, () => {
        if (!cancelled) setOnlineCount(Object.keys(channel.presenceState()).length);
      });
      channel.on("presence", { event: "leave" }, () => {
        if (!cancelled) setOnlineCount(Object.keys(channel.presenceState()).length);
      });

      channel.subscribe(async (status) => {
        if (cancelled || status !== "SUBSCRIBED") return;
        await channel.track({ online_at: new Date().toISOString() });
        const { error } = await client.rpc("heartbeat_presence");
        if (error) console.error("Heartbeat error on subscribe:", error);
      });
    })();

    const heartbeat = setInterval(async () => {
      if (!cancelled && !leavingRef.current) {
        const { error } = await client.rpc("heartbeat_presence");
        if (error) console.error("Heartbeat error on interval:", error);
      }
    }, 60_000);

    const onPageHide = () => leaveOnline();
    const onBeforeUnload = () => leaveOnline();

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        void ch.untrack();
        void client.removeChannel(ch);
      }
    };
  }, [client, ready]);

  return (
    <OnlinePresenceContext.Provider value={{ onlineCount }}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlineCount(): number {
  return useContext(OnlinePresenceContext).onlineCount;
}
