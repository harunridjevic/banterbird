import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, cookieSecret, verifyAnalyticsCookie } from "@/lib/ops/analytics-cookie";
import { analyticsPasswordConfigured } from "@/lib/ops/analytics-password";
import {
  type AnalyticsPeriod,
  resolvePeriodDays,
} from "@/lib/ops/analytics-types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/utils/supabase/server";

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
  const period = (searchParams.get("period") ?? "month") as AnalyticsPeriod;
  const rawDays = searchParams.get("days");
  const customDays = rawDays ? Number.parseInt(rawDays, 10) || 30 : 30;
  const days = resolvePeriodDays(
    ["today", "week", "month", "year", "custom"].includes(period) ? period : "month",
    customDays,
  );

  try {
    const admin = createServiceRoleClient();
    const client = createClient(cookieStore);
    const { data: { user } } = await client.auth.getUser();
    const currentUserId = user?.id || null;
    const { data, error } = await admin.rpc("ops_analytics_snapshot", {
      p_days: days,
      p_calendar_today: period === "today",
      p_current_user_id: currentUserId,
    });
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
