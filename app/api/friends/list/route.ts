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
    let friendProfiles: { id: string; username: string | null; avatar_url: string | null }[] = [];
    if (friendIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,username,avatar_url")
        .in("id", friendIds);
      friendProfiles = profiles ?? [];
    }

    const friends = friendIds.map((fid) => ({
      friend_id: fid,
      profiles: friendProfiles.find((p) => p.id === fid) ?? { id: fid, username: null, avatar_url: null },
    }));

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

    // ── Unread DM count ───────────────────────────────────────────
    const { data: rooms } = await supabase
      .from("dm_rooms")
      .select("id")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    const roomIds = (rooms ?? []).map((r: { id: string }) => r.id);

    let unreadDmCount = 0;
    if (roomIds.length > 0) {
      const { count } = await supabase
        .from("dm_messages")
        .select("id", { count: "exact", head: true })
        .neq("sender_id", user.id)
        .is("read_at", null)
        .in("room_id", roomIds);
      unreadDmCount = count ?? 0;
    }

    return NextResponse.json({ friends, incoming, unread_dm_count: unreadDmCount });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
