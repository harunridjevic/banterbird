import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cancelPaddleSubscription } from "@/lib/billing/paddle";

/**
 * POST /api/billing/cancel
 * Cancels the user's active Paddle subscription at the end of the current
 * billing period. PRO access continues until pro_until; no future charges.
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
      .select("id, paddle_subscription_id, status")
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

    await cancelPaddleSubscription(sub.paddle_subscription_id);

    // Mark as cancelled locally — webhook will confirm, but update optimistically
    await svc
      .from("pro_subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", sub.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cancel failed" },
      { status: 500 },
    );
  }
}
