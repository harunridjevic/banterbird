import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/** Idempotent purge of an ended or abandoned room row (messages cascade). */
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
    .select("id,user_a,user_b")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }

  // Already removed by end_active_room — success.
  if (!room) {
    return NextResponse.json({ success: true, alreadyGone: true });
  }

  if (room.user_a !== user.id && room.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const admin = createServiceRoleClient();
    const { error: delErr } = await admin.from("rooms").delete().eq("id", roomId);
    if (delErr) {
      console.error(`cleanup-room delete ${roomId}:`, delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Service role key missing." }, { status: 503 });
    }
    console.error(`Unexpected error cleaning up room ${roomId}:`, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
