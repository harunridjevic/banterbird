import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createProInvoice } from "@/lib/billing/nowpayments";
import { PRO_ORDER_PREFIX } from "@/lib/billing/constants";
import { loadAppSettings } from "@/lib/ops/app-settings";

function appOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  const url = new URL(req.url);
  return url.origin;
}

/**
 * POST /api/billing/checkout
 * Named accounts only. Creates a NOWPayments invoice ($9) and a pending
 * subscription row. Customer pays with card (fiat on-ramp) or crypto;
 * merchant receives crypto in the configured payout wallet.
 */
export async function POST(req: Request) {
  try {
    if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_IPN_SECRET) {
      return NextResponse.json(
        { error: "Billing is not configured yet. Please try again later." },
        { status: 503 },
      );
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to subscribe to PRO." }, { status: 401 });
    }

    const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous ?? false;
    const svc = createServiceRoleClient();

    const { data: profile } = await svc
      .from("profiles")
      .select("id,username,is_pro,pro_until")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.username) {
      return NextResponse.json(
        {
          error: isAnonymous
            ? "Create an account first, then subscribe to PRO."
            : "Set a username before subscribing to PRO.",
        },
        { status: 403 },
      );
    }

    // Soft-expire if period already ended
    await svc.rpc("sync_expired_pro", { p_user_id: user.id });

    // Load the current price from DB (admin-configurable); fall back to
    // the hardcoded constant if the DB row hasn't been written yet.
    const appSettings = await loadAppSettings();
    const proPriceUsd = appSettings.billing.proPriceUsd;

    const origin = appOrigin(req);
    const orderId = `${PRO_ORDER_PREFIX}_${user.id.replace(/-/g, "").slice(0, 12)}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

    const invoice = await createProInvoice({
      orderId,
      priceUsd: proPriceUsd,
      ipnCallbackUrl: `${origin}/api/billing/webhook`,
      successUrl: `${origin}/?billing=success`,
      cancelUrl: `${origin}/?billing=cancel`,
      customerEmail: user.email,
    });

    const { error: insertErr } = await svc.from("pro_subscriptions").insert({
      user_id: user.id,
      status: "pending",
      provider: "nowpayments",
      provider_invoice_id: String(invoice.id),
      order_id: orderId,
      amount_usd: proPriceUsd,
    });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      invoiceUrl: invoice.invoice_url,
      orderId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout failed" },
      { status: 500 },
    );
  }
}
