import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/** GET /api/friends/list - friends, pending incoming requests, and unread DM count */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Friends ──────────────────────────────────────────────────
    // Step 1: get friend IDs
    const { data: friendships } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);

    const friendIds = (friendships ?? []).map((f: { friend_id: string }) => f.friend_id);

    // Step 2: fetch their profiles separately (avoids FK alias issues)
    let friendProfiles: { id: string; username: string | null; avatar_url: string | null; is_pro: boolean; pro_until: string | null }[] = [];
    if (friendIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,username,avatar_url,is_pro,pro_until")
        .in("id", friendIds);
      friendProfiles = profiles ?? [];
    }

    const now = Date.now();
    const friends = friendIds.map((fid) => {
      const p = friendProfiles.find((p) => p.id === fid) ?? { id: fid, username: null, avatar_url: null, is_pro: false, pro_until: null };
      return {
        friend_id: fid,
        profiles: {
          id: p.id,
          username: p.username,
          avatar_url: p.avatar_url,
          is_pro: Boolean(p.is_pro) && !!p.pro_until && new Date(p.pro_until).getTime() > now,
        },
      };
    });

    // ── Incoming friend requests ──────────────────────────────────
    // Step 1: get pending requests to me
    const { data: requests } = await supabase
      .from("friend_requests")
      .select("id,from_id,created_at")
      .eq("to_id", user.id)
      .eq("status", "pending");

    const senderIds = (requests ?? []).map((r: { from_id: string }) => r.from_id);

    // Step 2: fetch sender profiles
    let senderProfiles: { id: string; username: string | null; avatar_url: string | null }[] = [];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,username,avatar_url")
        .in("id", senderIds);
      senderProfiles = profiles ?? [];
    }

    const incoming = (requests ?? []).map((r: { id: string; from_id: string; created_at: string }) => ({
      id: r.id,
      from_id: r.from_id,
      created_at: r.created_at,
      profiles: senderProfiles.find((p) => p.id === r.from_id) ?? { id: r.from_id, username: null, avatar_url: null },
    }));

    // ── Unread DM counts (per friend) ────────────────────────────
    // Fetch all DM rooms the user is in, noting which friend each room belongs to.
    const { data: rooms } = await supabase
      .from("dm_rooms")
      .select("id,user_a,user_b")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    const roomIds = (rooms ?? []).map((r: { id: string }) => r.id);

    // Map room_id → friend_id so we can attribute unread messages to the right friend.
    const roomToFriend: Record<string, string> = {};
    for (const r of rooms ?? []) {
      const room = r as { id: string; user_a: string; user_b: string };
      roomToFriend[room.id] = room.user_a === user.id ? room.user_b : room.user_a;
    }

    // unread_dm_counts: { [friendId]: number }
    const unreadDmCounts: Record<string, number> = {};
    let unreadDmCount = 0;

    if (roomIds.length > 0) {
      const { data: unreadMessages } = await supabase
        .from("dm_messages")
        .select("room_id")
        .neq("sender_id", user.id)
        .is("read_at", null)
        .in("room_id", roomIds);

      for (const msg of unreadMessages ?? []) {
        const m = msg as { room_id: string };
        const friendId = roomToFriend[m.room_id];
        if (friendId) {
          unreadDmCounts[friendId] = (unreadDmCounts[friendId] ?? 0) + 1;
          unreadDmCount++;
        }
      }
    }

    return NextResponse.json({ friends, incoming, unread_dm_count: unreadDmCount, unread_dm_counts: unreadDmCounts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
