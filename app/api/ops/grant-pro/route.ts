import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, cookieSecret, verifyAnalyticsCookie } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/ops/grant-pro
 * Grants or revokes unlimited PRO for a user from the ops dashboard.
 * Body: { userId: string; grant: boolean }
 *
 * Unlimited PRO uses pro_until = "2099-12-31" as a sentinel value —
 * it never expires and is not affected by the billing sync RPC.
 */
export async function POST(req: Request) {
  const secret = cookieSecret();
  if (!secret) return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { userId?: string; grant?: boolean };
  const { userId, grant } = body;
  if (!userId || typeof grant !== "boolean") {
    return NextResponse.json({ error: "userId and grant required" }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  if (grant) {
    // Set is_pro = true with a far-future pro_until so it never expires
    const { error } = await svc
      .from("profiles")
      .update({ is_pro: true, pro_until: "2099-12-31T00:00:00.000Z" })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Revoke: clear PRO
    const { error } = await svc
      .from("profiles")
      .update({ is_pro: false, pro_until: null })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
