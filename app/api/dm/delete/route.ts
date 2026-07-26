import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/dm/delete — delete all messages in a DM room.
 * Called when a user closes a conversation (ephemeral by design).
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
    await svc.from("dm_messages").delete().eq("room_id", roomId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
