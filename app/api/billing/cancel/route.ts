import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cancelPaddleSubscription } from "@/lib/billing/paddle";

/**
 * POST /api/billing/cancel
 * Cancels the user's Paddle subscription immediately on Paddle's side.
 * PRO access in the app continues until pro_until (already paid period).
 * No future charges will occur.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const svc = createServiceRoleClient();

    const { data: sub } = await svc
      .from("pro_subscriptions")
      .select("id, paddle_subscription_id, status, current_period_end")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .eq("status", "active")
      .maybeSingle();

    if (!sub?.paddle_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found." },
        { status: 404 },
      );
    }

    // Cancel on Paddle immediately — clears any pending scheduled changes first
    await cancelPaddleSubscription(sub.paddle_subscription_id);

    const now = new Date().toISOString();

    // Mark subscription as cancelled in our DB
    await svc
      .from("pro_subscriptions")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", sub.id);

    // Keep is_pro = true and pro_until intact — user keeps access until the
    // period they already paid for expires. sync_expired_pro will flip is_pro
    // to false automatically when pro_until passes.
    // Just return the pro_until so the UI can show "active until X".
    const { data: profile } = await svc
      .from("profiles")
      .select("pro_until")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      proUntil: profile?.pro_until ?? sub.current_period_end ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cancel failed" },
      { status: 500 },
    );
  }
}
