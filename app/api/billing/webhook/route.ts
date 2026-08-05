import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  computeNewProUntil,
  isSuccessfulPaymentStatus,
  verifyIpnSignature,
} from "@/lib/billing/nowpayments";
import { PRO_ORDER_PREFIX } from "@/lib/billing/constants";

type IpnBody = {
  payment_id?: string | number;
  invoice_id?: string | number | null;
  payment_status?: string;
  order_id?: string;
  price_amount?: string | number;
  price_currency?: string;
  [key: string]: unknown;
};

/**
 * POST /api/billing/webhook
 * NOWPayments IPN. Verifies HMAC, activates PRO on finished payments.
 */
export async function POST(req: Request) {
  try {
    const signature = req.headers.get("x-nowpayments-sig");
    const body = (await req.json()) as IpnBody;

    if (!verifyIpnSignature(body as Record<string, unknown>, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const orderId = typeof body.order_id === "string" ? body.order_id : null;
    if (!orderId || !orderId.startsWith(`${PRO_ORDER_PREFIX}_`)) {
      // Not our order — acknowledge so NOWPayments stops retrying
      return NextResponse.json({ ok: true, ignored: true });
    }

    const status = (body.payment_status ?? "").toLowerCase();
    const paymentId =
      body.payment_id !== undefined && body.payment_id !== null
        ? String(body.payment_id)
        : null;

    const svc = createServiceRoleClient();

    const { data: sub, error: subErr } = await svc
      .from("pro_subscriptions")
      .select("id,user_id,status,provider_payment_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (subErr || !sub) {
      return NextResponse.json({ error: "Unknown order" }, { status: 404 });
    }

    // Idempotency: already activated for this payment
    if (
      sub.status === "active" &&
      paymentId &&
      sub.provider_payment_id === paymentId
    ) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (status === "failed" || status === "expired" || status === "refunded") {
      if (sub.status === "pending") {
        await svc
          .from("pro_subscriptions")
          .update({
            status: status === "refunded" ? "cancelled" : "failed",
            provider_payment_id: paymentId,
            raw_ipn: body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
      }
      return NextResponse.json({ ok: true });
    }

    if (!isSuccessfulPaymentStatus(status)) {
      // confirming / sending / etc. — store payment id, wait for finished
      await svc
        .from("pro_subscriptions")
        .update({
          provider_payment_id: paymentId ?? undefined,
          provider_invoice_id:
            body.invoice_id != null ? String(body.invoice_id) : undefined,
          raw_ipn: body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
      return NextResponse.json({ ok: true, pending: true });
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("pro_until")
      .eq("id", sub.user_id)
      .maybeSingle();

    const periodStart = new Date();
    const periodEnd = computeNewProUntil(profile?.pro_until);

    const { error: updSubErr } = await svc
      .from("pro_subscriptions")
      .update({
        status: "active",
        provider_payment_id: paymentId,
        provider_invoice_id:
          body.invoice_id != null ? String(body.invoice_id) : undefined,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        raw_ipn: body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    if (updSubErr) {
      return NextResponse.json({ error: updSubErr.message }, { status: 500 });
    }

    const { error: updProfileErr } = await svc
      .from("profiles")
      .update({
        is_pro: true,
        pro_until: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.user_id);

    if (updProfileErr) {
      return NextResponse.json({ error: updProfileErr.message }, { status: 500 });
    }

    // Reflect PRO in app_metadata (not user_metadata) for future server checks
    try {
      await svc.auth.admin.updateUserById(sub.user_id, {
        app_metadata: {
          is_pro: true,
          pro_until: periodEnd.toISOString(),
        },
      });
    } catch {
      // Non-fatal — profiles row is source of truth for the app UI
    }

    return NextResponse.json({ ok: true, activated: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook error" },
      { status: 500 },
    );
  }
}
