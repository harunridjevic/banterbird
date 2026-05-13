import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, cookieSecret, verifyAnalyticsCookie } from "@/lib/ops/analytics-cookie";
import { analyticsPasswordConfigured } from "@/lib/ops/analytics-password";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(req: Request) {
  if (!analyticsPasswordConfigured()) {
    return NextResponse.json({ error: "Analytics is not configured on the server." }, { status: 503 });
  }

  const secret = cookieSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("days");
  const days = raw ? Math.min(365, Math.max(1, Number.parseInt(raw, 10) || 30)) : 30;

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("ops_analytics_snapshot", { p_days: days });
    if (error) {
      console.error("ops_analytics_snapshot", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ snapshot: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Service role key missing (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
