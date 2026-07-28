import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/migrate-pending-requests
 * Called after an anonymous user signs up or signs in.
 * Migrates any pending friend requests addressed to their old
 * anonymous user ID to their new named account user ID.
 *
 * Body: { oldUserId: string }
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { oldUserId?: string };
    const oldUserId = body.oldUserId?.trim();

    // If same ID or no old ID, nothing to migrate
    if (!oldUserId || oldUserId === user.id) {
      return NextResponse.json({ ok: true, migrated: 0 });
    }

    const svc = createServiceRoleClient();

    // Find pending friend requests sent TO the old anonymous ID
    const { data: pending } = await svc
      .from("friend_requests")
      .select("id, from_id, to_id, status")
      .eq("to_id", oldUserId)
      .eq("status", "pending");

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, migrated: 0 });
    }

    // Re-address each request to the new named user ID
    let migrated = 0;
    for (const req of pending) {
      // Skip if sender is the same as new user (self-request)
      if (req.from_id === user.id) continue;

      // Check if request already exists for new user ID
      const { data: existing } = await svc
        .from("friend_requests")
        .select("id")
        .eq("from_id", req.from_id)
        .eq("to_id", user.id)
        .maybeSingle();

      if (existing) continue;

      // Update to_id to point at the new named user
      const { error } = await svc
        .from("friend_requests")
        .update({ to_id: user.id })
        .eq("id", req.id);

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
