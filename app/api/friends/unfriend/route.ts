import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** POST /api/friends/unfriend — remove a friendship (both directions) */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { friendId?: string };
    const friendId = body.friendId;
    if (!friendId) return NextResponse.json({ error: "friendId required" }, { status: 400 });

    const svc = createServiceRoleClient();
    await svc.from("friendships").delete().eq("user_id", user.id).eq("friend_id", friendId);
    await svc.from("friendships").delete().eq("user_id", friendId).eq("friend_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
