import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/** Tab-close cleanup: drop presence heartbeat, leave queue, end open rooms. */
export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [leavePresence, leaveQueue, endRooms] = await Promise.all([
    supabase.rpc("leave_presence"),
    supabase.rpc("leave_match_queue"),
    supabase.rpc("end_user_active_rooms"),
  ]);

  const err =
    leavePresence.error?.message ??
    leaveQueue.error?.message ??
    endRooms.error?.message;
  if (err) {
    console.error("presence/leave", err);
    return NextResponse.json({ error: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
