"use client";

import { useMemo } from "react";
import { useOnlineUserIds } from "@/components/presence/OnlinePresenceProvider";

/**
 * Returns a Set of friend IDs that are currently online.
 * Reads from the global OnlinePresenceProvider which is always active —
 * so online status is accurate everywhere in the app, not just when
 * the friends panel is open.
 */
export function useFriendPresence(
  friendIds: string[],
  // These params kept for API compatibility but no longer needed
  _supabase?: unknown,
  _currentUserId?: string,
): Set<string> {
  const onlineUserIds = useOnlineUserIds();

  return useMemo(() => {
    const result = new Set<string>();
    for (const id of friendIds) {
      if (onlineUserIds.has(id)) result.add(id);
    }
    return result;
  }, [friendIds, onlineUserIds]);
}
