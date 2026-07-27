"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Subscribes to the global online_users presence channel and returns a Set
 * of user IDs that are currently online, filtered to the provided friendIds.
 *
 * Uses the existing `presence:online_users` channel that the app's
 * OnlinePresenceProvider tracks - we just listen to the same channel here
 * and check which friend IDs appear in the presence state.
 */
export function useFriendPresence(
  friendIds: string[],
  supabase: SupabaseClient,
  currentUserId: string,
): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (friendIds.length === 0) { setOnline(new Set()); return; }

    const friendSet = new Set(friendIds);

    const channel = supabase.channel("presence:online_users", {
      config: { presence: { key: currentUserId } },
    });

    const sync = () => {
      const state = channel.presenceState<{ user_id?: string }>();
      const onlineNow = new Set<string>();
      for (const entries of Object.values(state)) {
        for (const entry of entries) {
          const uid = (entry as { user_id?: string; key?: string }).user_id
            ?? (entry as { key?: string }).key
            ?? "";
          if (uid && friendSet.has(uid)) onlineNow.add(uid);
        }
      }
      setOnline(onlineNow);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: currentUserId });
          sync();
        }
      });

    return () => { void supabase.removeChannel(channel); };
  // Re-run only when the friend list changes (by stringifying for stable compare)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(friendIds), supabase, currentUserId]);

  return online;
}
