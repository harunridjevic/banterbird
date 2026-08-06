import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyPaddleSignature } from "@/lib/billing/paddle";
import { PRO_PERIOD_DAYS } from "@/lib/billing/constants";

// ---------------------------------------------------------------------------
// Paddle webhook event shapes (minimal — only fields we use)
// ---------------------------------------------------------------------------
type PaddleSubscriptionData = {
  id: string; // sub_...
  status: string; // active | canceled | past_due | paused | trialing
  customer_id: string; // ctm_...
  current_billing_period?: {
    starts_at?: string;
    ends_at?: string;
  };
  custom_data?: { user_id?: string } | null;
  items?: Array<{ price?: { product_id?: string } }>;
};

type PaddleTransactionData = {
  id: string; // txn_...
  status: string; // completed | ...
  customer_id?: string;
  subscription_id?: string | null;
  custom_data?: { user_id?: string } | null;
};

type PaddleEvent = {
  event_type: string;
  data: PaddleSubscriptionData | PaddleTransactionData;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function computeProUntil(
  existingUntil: string | null | undefined,
  periodEnd: string | null | undefined,
): Date {
  // Prefer Paddle's billing period end if available
  if (periodEnd) return new Date(periodEnd);
  // Otherwise extend from the later of now or current pro_until
  const now = new Date();
  const base =
    existingUntil && new Date(existingUntil).getTime() > now.getTime()
      ? new Date(existingUntil)
      : now;
  return addDays(base, PRO_PERIOD_DAYS);
}

/**
 * POST /api/billing/webhook
 * Paddle webhook handler. Verifies HMAC-SHA256 signature and processes
 * subscription lifecycle events to maintain PRO status in the DB.
 *
 * Subscribe these events in the Paddle dashboard:
 *   subscription.activated
 *   subscription.updated
 *   subscription.canceled
 *   transaction.completed
 */
export async function POST(req: Request) {
  // Must read raw body before any parsing for signature verification
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("paddle-signature");

  if (!verifyPaddleSignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  const { event_type, data } = event;

  // ------------------------------------------------------------------
  // subscription.activated — first payment succeeded, subscription live
  // subscription.updated   — renewal, plan change, payment method update
  // ------------------------------------------------------------------
  if (event_type === "subscription.activated" || event_type === "subscription.updated") {
    const sub = data as PaddleSubscriptionData;
    const userId = sub.custom_data?.user_id;
    if (!userId) {
      // custom_data missing — can't link to a user, acknowledge and move on
      return NextResponse.json({ ok: true, ignored: true });
    }

    const isActive = sub.status === "active" || sub.status === "trialing";
    const periodEnd = sub.current_billing_period?.ends_at ?? null;

    const { data: profile } = await svc
      .from("profiles")
      .select("pro_until")
      .eq("id", userId)
      .maybeSingle();

    const proUntil = computeProUntil(profile?.pro_until, periodEnd);
    const now = new Date().toISOString();

    // Upsert subscription row keyed by paddle_subscription_id
    const { error: subErr } = await svc.from("pro_subscriptions").upsert(
      {
        user_id: userId,
        status: isActive ? "active" : sub.status === "canceled" ? "cancelled" : "failed",
        provider: "paddle",
        paddle_subscription_id: sub.id,
        paddle_customer_id: sub.customer_id,
        order_id: `paddle_sub_${sub.id}`,
        amount_usd: 9,
        current_period_start: sub.current_billing_period?.starts_at ?? now,
        current_period_end: proUntil.toISOString(),
        updated_at: now,
      },
      { onConflict: "order_id" },
    );

    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    if (isActive) {
      await svc
        .from("profiles")
        .update({
          is_pro: true,
          pro_until: proUntil.toISOString(),
          updated_at: now,
        })
        .eq("id", userId);

      try {
        await svc.auth.admin.updateUserById(userId, {
          app_metadata: { is_pro: true, pro_until: proUntil.toISOString() },
        });
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // subscription.canceled — immediately or at period end
  // ------------------------------------------------------------------
  if (event_type === "subscription.canceled") {
    const sub = data as PaddleSubscriptionData;
    const userId = sub.custom_data?.user_id;
    if (!userId) return NextResponse.json({ ok: true, ignored: true });

    const now = new Date().toISOString();

    // Mark subscription cancelled; keep pro_until intact so they have access
    // until the period they already paid for ends (Paddle cancels at period end).
    await svc
      .from("pro_subscriptions")
      .update({ status: "cancelled", updated_at: now })
      .eq("paddle_subscription_id", sub.id);

    // If period already ended, also revoke PRO immediately
    const periodEnd = sub.current_billing_period?.ends_at;
    if (periodEnd && new Date(periodEnd).getTime() < Date.now()) {
      await svc
        .from("profiles")
        .update({ is_pro: false, updated_at: now })
        .eq("id", userId);
    }

    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------
  // transaction.completed — a payment went through (initial or renewal).
  // Links the pending checkout row to the subscription, stores txn ID.
  // ------------------------------------------------------------------
  if (event_type === "transaction.completed") {
    const txn = data as PaddleTransactionData;
    const userId = txn.custom_data?.user_id;
    if (!userId || !txn.subscription_id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const now = new Date().toISOString();

    // Update the pending row that was created at checkout time
    await svc
      .from("pro_subscriptions")
      .update({
        paddle_subscription_id: txn.subscription_id,
        paddle_customer_id: txn.customer_id ?? undefined,
        paddle_transaction_id: txn.id,
        updated_at: now,
      })
      .eq("order_id", `paddle_txn_${txn.id}`);

    return NextResponse.json({ ok: true });
  }

  // Unhandled event type — acknowledge so Paddle doesn't retry
  return NextResponse.json({ ok: true, ignored: true });
}
