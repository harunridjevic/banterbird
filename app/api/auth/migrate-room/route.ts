import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { oldUserId?: string; newUserId?: string };
    const oldUserId = body.oldUserId?.trim();
    const explicitNewUserId = body.newUserId?.trim();

    // Resolve current user — explicit ID takes priority to avoid timing races
    let newUserId: string | null = explicitNewUserId ?? null;

    if (!newUserId) {
      const cookieStore = await cookies();
      const supabase = createClient(cookieStore);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      newUserId = user.id;
    }

    if (!oldUserId || oldUserId === newUserId) {
      return NextResponse.json({ ok: true, migrated: false });
    }

    const svc = createServiceRoleClient();

    // Verify target user exists
    const { data: targetUser } = await svc.auth.admin.getUserById(newUserId);
    if (!targetUser?.user) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    // Find active rooms where the old anonymous user was a participant
    const [{ data: roomsAsA }, { data: roomsAsB }] = await Promise.all([
      svc.from("rooms").select("id").eq("user_a", oldUserId).is("ended_at", null),
      svc.from("rooms").select("id").eq("user_b", oldUserId).is("ended_at", null),
    ]);

    let migrated = false;

    for (const room of roomsAsA ?? []) {
      await svc.from("rooms").update({ user_a: newUserId }).eq("id", room.id);
      migrated = true;
    }

    for (const room of roomsAsB ?? []) {
      await svc.from("rooms").update({ user_b: newUserId }).eq("id", room.id);
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
