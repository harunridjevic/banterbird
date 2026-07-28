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

    if (res.status === 403) {
      return { allowed: false, reason: "blocked" };
    }
    if (res.status === 401) {
      return { allowed: false, reason: "unauthorized" };
    }
    if (!res.ok) {
      return { allowed: false, reason: "error" };
    }
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
  const blocked = getSessionBlockedUsers();
  if (blocked.length === 0) return true;

  const peerId = await peerIdForRoom(client, roomId, selfId);
  if (!peerId) return true;

  if (!blocked.includes(peerId)) return true;

  // Peer is in session blocks — but session blocks may contain former friends
  // who were skipped while the friendship was active. Check if they are a
  // current friend (should be blocked from random match) or a former friend
  // (should be allowed — they were unblocked by unfriending).
  // We do this by checking: are they currently a friend in the DB?
  const { data: friendship } = await client
    .from("friendships")
    .select("friend_id")
    .eq("user_id", selfId)
    .eq("friend_id", peerId)
    .maybeSingle();

  if (friendship) {
    // Still a current friend — block this room (friends should use DMs)
    return false;
  }

  // Former friend or unrelated block — clear the stale session block and allow
  // (this only clears it for the current user; the other side is handled by
  // the same logic on their own shouldAcceptRoom call)
  const { unblockUserForSession } = await import("@/lib/moderation/session-block");
  unblockUserForSession(peerId);
  return true;
}

export async function rejectBlockedRoom(
  client: SupabaseClient,
  roomId: string,
): Promise<void> {
  await client.rpc("end_active_room", { p_room_id: roomId });
}
