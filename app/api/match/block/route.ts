import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/match/block
 * Records that the current user skipped/blocked a peer so try_match
 * can exclude them for BOTH parties server-side.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { blockedId?: string };
    const blockedId = body.blockedId;
    if (!blockedId || blockedId === user.id) {
      return NextResponse.json({ ok: true });
    }

    await supabase
      .from("session_blocks")
      .upsert(
        { blocker_id: user.id, blocked_id: blockedId },
        { onConflict: "blocker_id,blocked_id" },
      );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
