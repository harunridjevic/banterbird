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

  // Peer is session-blocked. Check current friendship status.
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

  // Not a current friend. Check if they were a former friend — if so, the
  // session block may be stale (set while they were still a friend, before
  // the unfriend removed them from session storage on this device). Former
  // friends should be allowed to rematch.
  const { data: formerFriendship } = await client
    .from("friend_requests")
    .select("id")
    .or(`and(from_id.eq.${selfId},to_id.eq.${peerId}),and(from_id.eq.${peerId},to_id.eq.${selfId})`)
    .eq("status", "accepted")
    .maybeSingle();

  if (formerFriendship) {
    // Was a friend at some point — stale session block, allow the match
    return true;
  }

  // Not a current or former friend and in session blocks = explicit skip. Block.
  return false;
}

export async function rejectBlockedRoom(
  client: SupabaseClient,
  roomId: string,
): Promise<void> {
  // Leave the room one-sidedly — don't end it for the other user.
  // Using leave_match_queue + end_active_room would kill the room for both
  // people and cause a re-match loop. Instead we just remove ourselves from
  // the room so the other user can re-match freely.
  try {
    await client.rpc("leave_active_room", { p_room_id: roomId });
  } catch {
    // Fallback: if leave_active_room RPC doesn't exist, end the room
    // (older schema). This may cause a brief re-match but avoids getting stuck.
    await client.rpc("end_active_room", { p_room_id: roomId });
  }
}
