import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/delete-account
 * Permanently deletes the authenticated user's account and all their data.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceRoleClient();

    // Delete profile (cascades to friendships, friend_requests, dm_messages via FK)
    await svc.from("profiles").delete().eq("id", user.id);

    // Delete the auth user — this is irreversible
    const { error: deleteErr } = await svc.auth.admin.deleteUser(user.id);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    // Sign out the session
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
