import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/migrate-room
 * After Google sign-in from an anonymous session, migrates the anonymous
 * user's active room participation to the new named account user ID.
 * This allows the chat to continue seamlessly after sign-in.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { oldUserId?: string };
    const oldUserId = body.oldUserId?.trim();

    if (!oldUserId || oldUserId === user.id) {
      return NextResponse.json({ ok: true, migrated: false });
    }

    const svc = createServiceRoleClient();

    // Find active rooms where the old anonymous user was a participant
    const { data: roomsAsA } = await svc
      .from("rooms")
      .select("id, user_a, user_b")
      .eq("user_a", oldUserId)
      .is("ended_at", null);

    const { data: roomsAsB } = await svc
      .from("rooms")
      .select("id, user_a, user_b")
      .eq("user_b", oldUserId)
      .is("ended_at", null);

    let migrated = false;

    // Update user_a slots
    for (const room of roomsAsA ?? []) {
      await svc
        .from("rooms")
        .update({ user_a: user.id })
        .eq("id", room.id);
      migrated = true;
    }

    // Update user_b slots
    for (const room of roomsAsB ?? []) {
      await svc
        .from("rooms")
        .update({ user_b: user.id })
        .eq("id", room.id);
      migrated = true;
    }

    return NextResponse.json({ ok: true, migrated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
