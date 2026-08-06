import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cancelPaddleSubscription } from "@/lib/billing/paddle";

/**
 * POST /api/auth/delete-account
 * Permanently deletes the authenticated user's account and all their data.
 * Cancels any active Paddle subscription first so no future charges occur.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceRoleClient();

    // Cancel active Paddle subscription before deleting so no future charges fire.
    // Non-fatal — if it fails we still delete the account.
    try {
      const { data: sub } = await svc
        .from("pro_subscriptions")
        .select("paddle_subscription_id")
        .eq("user_id", user.id)
        .eq("provider", "paddle")
        .eq("status", "active")
        .maybeSingle();

      if (sub?.paddle_subscription_id) {
        await cancelPaddleSubscription(sub.paddle_subscription_id);
        await svc
          .from("pro_subscriptions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("paddle_subscription_id", sub.paddle_subscription_id);
      }
    } catch {
      // Non-fatal — proceed with account deletion regardless
    }

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
