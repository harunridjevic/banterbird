import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let roomId: string | undefined;
  try {
    const body = (await request.json()) as { roomId?: string };
    roomId = body.roomId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("id,user_a,user_b,ended_at")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (!room.ended_at) {
    return NextResponse.json({ error: "Room is still active" }, { status: 400 });
  }
  if (room.user_a !== user.id && room.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Don't delete immediately - let the scheduled cleanup_old_rooms function handle it after 1 hour
    // This preserves analytics data while still eventually cleaning up for privacy
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(`Unexpected error cleaning up room ${roomId}:`, e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
