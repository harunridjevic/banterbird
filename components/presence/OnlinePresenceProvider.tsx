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
import {
  ensureAnonymousSession,
  formatAuthError,
  isStaleUserDbError,
} from "@/lib/auth/ensure-anonymous-session";
import { tabCloseFetch } from "@/lib/presence/tab-close-fetch";

type OnlinePresenceCtx = {
  onlineCount: number;
  /** Set of user IDs currently online — derived from presence state */
  onlineUserIds: Set<string>;
};

const OnlinePresenceContext = createContext<OnlinePresenceCtx>({ onlineCount: 0, onlineUserIds: new Set() });

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { client, ready } = useSupabase();
  const pathname = usePathname();
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const leavingRef = useRef(false);
  const sessionUserIdRef = useRef<string | null>(null);
  const recoveringRef = useRef(false);
  const opsClearedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    leavingRef.current = false;
    sessionUserIdRef.current = null;
    recoveringRef.current = false;
    opsClearedRef.current = false;

    const isOpsPath = () =>
      typeof window !== "undefined" && window.location.pathname.startsWith("/ops");

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

    const teardownChannel = async () => {
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        try {
          await ch.untrack();
        } catch {
          /* channel may already be closed */
        }
        await client.removeChannel(ch);
      }

      // Supabase reuses channels by topic - remove leftovers before re-subscribing
      // so we never call .on("presence") after subscribe().
      for (const existing of client.getChannels()) {
        const topic = existing.topic ?? "";
        if (topic === "realtime:banterbird-online" || topic.endsWith(":banterbird-online")) {
          await client.removeChannel(existing);
        }
      }
    };

    const setupPresenceChannel = async (userId: string) => {
      await teardownChannel();
      if (cancelled || leavingRef.current) return;

      const channel = client.channel("banterbird-online", {
        config: { presence: { key: userId } },
      });

      // Presence callbacks must be registered before subscribe().
      const refreshCount = () => {
        if (!cancelled) {
          const state = channel.presenceState<{ online_at?: string; user_id?: string }>();
          const keys = Object.keys(state);
          setOnlineCount(keys.length);
          // Build set of online user IDs from presence keys (which are userId)
          const ids = new Set<string>(keys);
          setOnlineUserIds(ids);
        }
      };
      channel.on("presence", { event: "sync" }, refreshCount);
      channel.on("presence", { event: "join" }, refreshCount);
      channel.on("presence", { event: "leave" }, refreshCount);

      channelRef.current = channel;

      await new Promise<void>((resolve) => {
        channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            if (!cancelled && !leavingRef.current && !isOpsPath()) {
              await channel.track({ online_at: new Date().toISOString() });
            }
            resolve();
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            resolve();
          }
        });
      });
    };

    const ensureLiveUser = async (): Promise<string | null> => {
      const {
        data: { user },
        error: userErr,
      } = await client.auth.getUser();

      if (user?.id && !userErr) {
        return user.id;
      }

      const result = await ensureAnonymousSession(client);
      if (!result.ok) {
        const msg = result.error.toLowerCase();
        if (!msg.includes("disconnected")) {
          console.error("Heartbeat session recovery failed:", result.error);
        }
        return null;
      }
      return result.userId;
    };

    const clearOpsHeartbeat = async () => {
      if (opsClearedRef.current) return;
      opsClearedRef.current = true;
      await client.rpc("leave_presence");
    };

    const recoverStaleSession = async () => {
      if (recoveringRef.current || cancelled || leavingRef.current) return;
      recoveringRef.current = true;
      try {
        sessionUserIdRef.current = null;
        await teardownChannel();
        const userId = await ensureLiveUser();
        if (!userId || cancelled || leavingRef.current) return;
        sessionUserIdRef.current = userId;
        await setupPresenceChannel(userId);
        if (!isOpsPath()) {
          await client.rpc("heartbeat_presence", { p_is_ops: false });
        }
      } finally {
        recoveringRef.current = false;
      }
    };

    const pingHeartbeat = async () => {
      if (recoveringRef.current || leavingRef.current) return;

      if (isOpsPath()) {
        // Ops viewers only observe presence; heartbeats would pollute session-time metrics.
        await clearOpsHeartbeat();
        return;
      }

      const userId = await ensureLiveUser();
      if (!userId || cancelled) return;

      if (sessionUserIdRef.current !== userId) {
        sessionUserIdRef.current = userId;
        await setupPresenceChannel(userId);
      }

      const { error } = await client.rpc("heartbeat_presence", { p_is_ops: false });
      if (error) {
        const msg = formatAuthError(error);
        if (msg.toLowerCase().includes("disconnected")) return;
        if (isStaleUserDbError(msg)) {
          await recoverStaleSession();
          return;
        }
        console.error("Heartbeat error:", msg);
      }
    };

    void (async () => {
      if (isOpsPath()) {
        await clearOpsHeartbeat();
      }
      const userId = await ensureLiveUser();
      if (!userId || cancelled) return;
      sessionUserIdRef.current = userId;
      await setupPresenceChannel(userId);
      if (!isOpsPath()) {
        await client.rpc("heartbeat_presence", { p_is_ops: false });
      }
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
      void teardownChannel();
    };
  }, [client, ready, pathname]);

  return (
    <OnlinePresenceContext.Provider value={{ onlineCount, onlineUserIds }}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlineCount(): number {
  return useContext(OnlinePresenceContext).onlineCount;
}

export function useOnlineUserIds(): Set<string> {
  return useContext(OnlinePresenceContext).onlineUserIds;
}
