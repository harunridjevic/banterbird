"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSupabase } from "@/app/providers";
import { formatAuthError } from "@/lib/auth/ensure-anonymous-session";
import { tabCloseFetch } from "@/lib/presence/tab-close-fetch";

type OnlinePresenceCtx = {
  onlineCount: number;
};

const OnlinePresenceContext = createContext<OnlinePresenceCtx>({ onlineCount: 0 });

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { client, ready } = useSupabase();
  const pathname = usePathname();
  const [onlineCount, setOnlineCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const leavingRef = useRef(false);
  const sessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    leavingRef.current = false;
    sessionUserIdRef.current = null;
    const isOpsPage = pathname?.startsWith("/ops") ?? false;

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

    const pingHeartbeat = async () => {
      if (!sessionUserIdRef.current) {
        // Self-heal: anonymous session creation can race initial load on some pages.
        // Re-check auth so heartbeats still run while idling on the main app.
        const { data: { user } } = await client.auth.getUser();
        if (!user?.id) return;
        sessionUserIdRef.current = user.id;
      }
      const { error } = await client.rpc("heartbeat_presence", { p_is_ops: isOpsPage });
      if (error) {
        const msg = formatAuthError(error);
        // Transient during tab/network disconnect; avoid noisy console errors.
        if (msg.toLowerCase().includes("disconnected")) return;
        console.error("Heartbeat error:", msg);
      }
    };

    void (async () => {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (cancelled || !user?.id) return;

      sessionUserIdRef.current = user.id;

      const channel = client.channel("banterbird-online", {
        config: { presence: { key: user.id } },
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
        // In ops, only observe presence (don't track self).
        if (!isOpsPage) {
          await channel.track({ online_at: new Date().toISOString() });
        }
        await pingHeartbeat();
      });
    })();

    const heartbeat = setInterval(() => {
      if (!cancelled && !leavingRef.current) void pingHeartbeat();
    }, 30_000);

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
  }, [client, ready, pathname]);

  return (
    <OnlinePresenceContext.Provider value={{ onlineCount }}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlineCount(): number {
  return useContext(OnlinePresenceContext).onlineCount;
}
