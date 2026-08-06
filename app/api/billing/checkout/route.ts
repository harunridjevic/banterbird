import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createPaddleTransaction, getClientToken } from "@/lib/billing/paddle";

/**
 * Detect the user's country code (ISO 3166-1 alpha-2) from the request.
 *
 * Priority:
 * 1. x-vercel-ip-country header (free, zero-latency on Vercel)
 * 2. CF-IPCountry header (Cloudflare)
 * 3. ip-api.com free geo lookup (local dev fallback, ~100ms)
 */
async function detectCountryCode(reqHeaders: Headers): Promise<string | null> {
  // 1. Vercel edge header — populated automatically on all Vercel deployments
  const vercelCountry = reqHeaders.get("x-vercel-ip-country");
  if (vercelCountry && vercelCountry !== "XX") return vercelCountry.toUpperCase();

  // 2. Cloudflare header
  const cfCountry = reqHeaders.get("cf-ipcountry");
  if (cfCountry && cfCountry !== "XX") return cfCountry.toUpperCase();

  // 3. Free IP geo lookup for local dev (ip-api.com — 1000 req/min free, no key needed)
  try {
    const ip =
      reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      reqHeaders.get("x-real-ip") ??
      null;

    // Don't bother looking up private/loopback IPs
    if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return null;
    }

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { countryCode?: string };
    return data.countryCode ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /api/billing/checkout
 * Named accounts only. Creates a Paddle transaction and returns the
 * transaction ID so the client can open the Paddle overlay checkout.
 */
export async function POST(req: Request) {
  console.log("[Checkout] Starting checkout request");
  console.log("[Checkout] Env check:", { sandbox: process.env.PADDLE_SANDBOX });

  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Sign in to subscribe to PRO." },
        { status: 401 },
      );
    }

    const isAnonymous =
      (user as { is_anonymous?: boolean }).is_anonymous ?? false;
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

    // Block if already active PRO with a Paddle subscription (prevent duplicate subs)
    const { data: existingSub } = await svc
      .from("pro_subscriptions")
      .select("id,status,paddle_subscription_id")
      .eq("user_id", user.id)
      .eq("provider", "paddle")
      .in("status", ["active", "pending"])
      .maybeSingle();

    if (existingSub?.status === "active" && existingSub.paddle_subscription_id) {
      return NextResponse.json(
        { error: "You already have an active PRO subscription." },
        { status: 409 },
      );
    }

    // Detect country from IP — non-fatal if it fails
    const countryCode = await detectCountryCode(req.headers);
    console.log("[Checkout] Detected country:", countryCode ?? "unknown");

    const transaction = await createPaddleTransaction({
      userId: user.id,
      customerEmail: user.email,
    });

    console.log("[Checkout] Transaction created:", transaction.id);

    await svc.from("pro_subscriptions").upsert(
      {
        user_id: user.id,
        status: "pending",
        provider: "paddle",
        order_id: `paddle_txn_${transaction.id}`,
        paddle_transaction_id: transaction.id,
        amount_usd: 9,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id" },
    );

    return NextResponse.json({
      ok: true,
      transactionId: transaction.id,
      clientToken: getClientToken(),
      customerEmail: user.email ?? null,
      countryCode: countryCode ?? null,
      sandbox: process.env.PADDLE_SANDBOX === "true",
    });
  } catch (e) {
    console.error("[Checkout] Caught error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout failed" },
      { status: 500 },
    );
  }
}
