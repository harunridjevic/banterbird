import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAnonymousSession } from "@/lib/auth/ensure-anonymous-session";
import { getDeviceId } from "@/lib/moderation/device-id";
import { getSessionBlockedUsers } from "@/lib/moderation/session-block";

async function postAccessCheck(): Promise<Response> {
  return fetch("/api/match/access-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId() }),
  });
}

export async function checkMatchAccess(
  client?: SupabaseClient,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    let res = await postAccessCheck();

    if (res.status === 401 && client) {
      const recovered = await ensureAnonymousSession(client);
      if (recovered.ok) {
        res = await postAccessCheck();
      }
    }

    if (res.status === 403) return { allowed: false, reason: "blocked" };
    if (res.status === 401) return { allowed: false, reason: "unauthorized" };
    if (!res.ok) return { allowed: false, reason: "error" };
    return { allowed: true };
  } catch {
    return { allowed: false, reason: "error" };
  }
}

export async function peerIdForRoom(
  client: SupabaseClient,
  roomId: string,
  selfId: string,
): Promise<string | null> {
  const { data: room } = await client
    .from("rooms")
    .select("user_a,user_b,is_ai_room")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.is_ai_room) return null;
  return room.user_a === selfId ? room.user_b : room.user_a;
}

export async function shouldAcceptRoom(
  client: SupabaseClient,
  roomId: string,
  selfId: string,
): Promise<boolean> {
  const sessionBlocked = getSessionBlockedUsers();
  if (sessionBlocked.length === 0) return true;

  const peerId = await peerIdForRoom(client, roomId, selfId);
  if (!peerId) return true;

  if (!sessionBlocked.includes(peerId)) return true;

  // Peer is session-blocked. Two cases:
  // 1. They were blocked by an explicit skip (blockPeer=true) — respect the block.
  // 2. They ended up in session storage as a stale entry from when they were
  //    a friend who got skipped while the friendship was active, and then the
  //    friendship was ended. In this case unblockUserForSession was called
  //    when unfriending — so if they're still in the list here, it IS a
  //    real skip block. Respect it.
  //
  // Exception: if they are currently a friend in the DB, this is a friend who
  // was skipped (e.g. during an anonymous chat before becoming friends).
  // Friends should not be matched randomly — block the room.
  const { data: friendship } = await client
    .from("friendships")
    .select("friend_id")
    .eq("user_id", selfId)
    .eq("friend_id", peerId)
    .maybeSingle();

  if (friendship) {
    // Current friend matched randomly — reject so they use DMs instead
    return false;
  }

  // Not a current friend and in session blocks = explicit skip. Block.
  return false;
}

export async function rejectBlockedRoom(
  client: SupabaseClient,
  roomId: string,
): Promise<void> {
  await client.rpc("end_active_room", { p_room_id: roomId });
}
