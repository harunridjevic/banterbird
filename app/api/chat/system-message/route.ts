import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/chat/system-message
 * Inserts a [system] message into the messages table for a room.
 * Uses service role so it can be inserted without a user_id (system messages
 * have user_id = null which the RLS insert policy normally blocks).
 * Caller must be a participant in the room.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { roomId?: string; text?: string };
    const { roomId, text } = body;
    if (!roomId || !text?.trim()) {
      return NextResponse.json({ error: "roomId and text required" }, { status: 400 });
    }

    // Verify the caller is a participant
    const { data: room } = await supabase
      .from("rooms")
      .select("id, user_a, user_b, ended_at")
      .eq("id", roomId)
      .maybeSingle();

    if (!room || room.ended_at) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (room.user_a !== user.id && room.user_b !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const { data: msg, error: insErr } = await svc
      .from("messages")
      .insert({
        room_id: roomId,
        user_id: null,           // system messages have no user
        content: `[system]${text.trim()}`,
        is_from_ai: false,
      })
      .select("id, room_id, user_id, content, created_at, is_from_ai")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ message: msg });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
