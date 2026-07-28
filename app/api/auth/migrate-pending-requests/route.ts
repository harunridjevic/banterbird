import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { oldUserId?: string };
    const oldUserId = body.oldUserId?.trim();

    // Always use the authenticated session user as the migration target.
    // Never accept newUserId from the request body.
    const newUserId = user.id;

    if (!oldUserId || oldUserId === newUserId) {
      return NextResponse.json({ ok: true, migrated: 0 });
    }

    const svc = createServiceRoleClient();

    // Find pending friend requests sent to the old anonymous ID
    const { data: pending } = await svc
      .from("friend_requests")
      .select("id, from_id")
      .eq("to_id", oldUserId)
      .eq("status", "pending");

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, migrated: 0 });
    }

    let migrated = 0;
    for (const request of pending) {
      if (request.from_id === newUserId) continue;

      const { data: existing } = await svc
        .from("friend_requests")
        .select("id")
        .eq("from_id", request.from_id)
        .eq("to_id", newUserId)
        .maybeSingle();

      if (existing) continue;

      const { error } = await svc
        .from("friend_requests")
        .update({ to_id: newUserId })
        .eq("id", request.id);

      if (!error) migrated++;
    }

    return NextResponse.json({ ok: true, migrated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
