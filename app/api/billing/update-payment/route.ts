import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getPaddleCustomerPortalUrl,
  getCustomerIdFromSubscription,
} from "@/lib/billing/paddle";

/**
 * POST /api/billing/update-payment
 * Returns a Paddle customer portal URL so the user can update their
 * saved payment method for recurring billing.
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
      .select("id, paddle_subscription_id, paddle_customer_id")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .in("status", ["active", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.paddle_subscription_id) {
      return NextResponse.json(
        { error: "No Paddle subscription found." },
        { status: 404 },
      );
    }

    // If customer ID is missing (webhook didn't fire yet on localhost),
    // fetch it directly from Paddle and store it for next time.
    let customerId = sub.paddle_customer_id;
    if (!customerId) {
      customerId = await getCustomerIdFromSubscription(sub.paddle_subscription_id);
      await svc
        .from("pro_subscriptions")
        .update({ paddle_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", sub.id);
    }

    const portalUrl = await getPaddleCustomerPortalUrl(
      customerId,
      sub.paddle_subscription_id,
    );

    return NextResponse.json({ ok: true, portalUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not open payment portal" },
      { status: 500 },
    );
  }
}
