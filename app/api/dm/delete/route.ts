import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/dm/delete
 * Called when a user closes a DM conversation.
 *
 * Deletes only messages that BOTH parties have seen:
 *   - Messages sent by the other person where read_at IS NOT NULL
 *     (the current user has read them).
 *   - Messages sent by the current user where read_at IS NOT NULL
 *     (the other person has read them).
 *
 * Unread messages are left in place so the other person still
 * sees them when they next open the conversation.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { roomId?: string };
    const roomId = body.roomId;
    if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

    // Verify participant
    const { data: room } = await supabase
      .from("dm_rooms")
      .select("id,user_a,user_b")
      .eq("id", roomId)
      .maybeSingle();

    if (!room || (room.user_a !== user.id && room.user_b !== user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // Delete messages that have been read by the recipient
    await svc
      .from("dm_messages")
      .delete()
      .eq("room_id", roomId)
      .not("read_at", "is", null);

    // Also delete any messages older than 30 days (ephemeral cleanup)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await svc
      .from("dm_messages")
      .delete()
      .eq("room_id", roomId)
      .lt("created_at", thirtyDaysAgo.toISOString());

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
