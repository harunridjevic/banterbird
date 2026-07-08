import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, cookieSecret, verifyAnalyticsCookie } from "@/lib/ops/analytics-cookie";
import { analyticsPasswordConfigured } from "@/lib/ops/analytics-password";
import {
  type AnalyticsPeriod,
  type AnalyticsSnapshot,
  resolvePeriodDays,
} from "@/lib/ops/analytics-types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type SessionMinutesRow = {
  avg_minutes: number | null;
  total_minutes: number;
};

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
    const { data, error } = await admin.rpc("ops_analytics_snapshot", {
      p_days: days,
      p_calendar_today: period === "today",
      // Viewer exclusion is handled inside the snapshot via `user_heartbeats.is_ops`.
      p_current_user_id: null,
    });
    if (error) {
      console.error("ops_analytics_snapshot", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const snapshot = data as AnalyticsSnapshot;
    const { data: timeRows, error: timeErr } = await admin.rpc("ops_user_session_minutes", {
      p_since: snapshot.sinceUtc,
      p_except: null,
    });
    if (!timeErr && Array.isArray(timeRows) && timeRows.length > 0) {
      const row = timeRows[0] as SessionMinutesRow;
      snapshot.avgUserSessionMinutes = row.avg_minutes;
      snapshot.totalUserSessionMinutes = row.total_minutes;
    } else if (timeErr) {
      console.error("ops_user_session_minutes", timeErr);
    }

    return NextResponse.json({ snapshot });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Service role key missing (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
