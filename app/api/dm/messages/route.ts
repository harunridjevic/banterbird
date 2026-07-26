import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/** GET /api/dm/messages?roomId=xxx — fetch messages for a DM room */
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

    // Verify user is a participant
    const { data: room } = await supabase
      .from("dm_rooms")
      .select("id,user_a,user_b")
      .eq("id", roomId)
      .maybeSingle();

    if (!room || (room.user_a !== user.id && room.user_b !== user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: messages } = await supabase
      .from("dm_messages")
      .select("id,sender_id,content,read_at,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    // Mark unread messages (sent by the other person) as read
    const unread = (messages ?? [])
      .filter((m) => m.sender_id !== user.id && !m.read_at)
      .map((m) => m.id);

    if (unread.length > 0) {
      await supabase
        .from("dm_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread);
    }

    return NextResponse.json({ messages: messages ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

/** POST /api/dm/messages — send a DM */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { friendId?: string; content?: string };
    const content = body.content?.trim();
    const friendId = body.friendId;
    if (!content || !friendId) return NextResponse.json({ error: "friendId and content required" }, { status: 400 });
    if (content.length > 2000) return NextResponse.json({ error: "Message too long" }, { status: 400 });

    // Verify they are friends
    const { data: friendship } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id)
      .eq("friend_id", friendId)
      .maybeSingle();

    if (!friendship) return NextResponse.json({ error: "You are not friends with this user." }, { status: 403 });

    // Get or create DM room via RPC
    const { data: roomId, error: rpcErr } = await supabase.rpc("get_or_create_dm_room", { p_other_id: friendId });
    if (rpcErr || !roomId) return NextResponse.json({ error: rpcErr?.message ?? "Could not open DM room." }, { status: 500 });

    const { data: msg, error: insErr } = await supabase
      .from("dm_messages")
      .insert({ room_id: roomId, sender_id: user.id, content })
      .select("id,sender_id,content,read_at,created_at")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ message: msg, roomId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
