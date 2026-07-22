import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OnlineDayPoint, OnlineHourPoint } from "@/lib/ops/analytics-types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Direct table query fallback used when the aggregation RPC isn't deployed yet. */
async function fetchOnlineUsersByDayFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  since: string,
  until: string,
): Promise<OnlineDayPoint[]> {
  console.log("[online-series day] using fallback direct query");
  // Fetch in reverse order so the most recent rows come first, then only take
  // the newest N rows to stay well under the 1000-row PostgREST cap.
  // We fetch 7 separate 1-day windows to get the last 7 days without hitting the limit.
  const byDay = new Map<string, { peak: number; sum: number; n: number }>();
  const sinceDate = new Date(since);
  const untilDate = new Date(until);
  const totalMs = untilDate.getTime() - sinceDate.getTime();
  const totalDays = Math.ceil(totalMs / (24 * 60 * 60 * 1000));

  // Chunk into individual day queries so each stays well under 1000 rows.
  for (let d = 0; d < totalDays; d++) {
    const dayStart = new Date(sinceDate.getTime() + d * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const { data } = await admin
      .from("online_count_snapshots")
      .select("recorded_at,online_count")
      .gte("recorded_at", dayStart.toISOString())
      .lt("recorded_at", dayEnd.toISOString())
      .order("recorded_at", { ascending: true });
    if (!Array.isArray(data)) continue;
    for (const row of data) {
      const date = new Date(String(row.recorded_at)).toISOString().slice(0, 10);
      const count = Number(row.online_count) || 0;
      const cur = byDay.get(date) ?? { peak: 0, sum: 0, n: 0 };
      cur.peak = Math.max(cur.peak, count);
      cur.sum += count;
      cur.n += 1;
      byDay.set(date, cur);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      peak: v.peak,
      avg: Math.round((v.sum / v.n) * 10) / 10,
    }));
}

/** Peak + average concurrent online users per UTC day, aggregated in the DB. */
export async function fetchOnlineUsersByDay(sinceUtc: string, days?: number): Promise<OnlineDayPoint[]> {
  try {
    const admin = createServiceRoleClient();

    // Compute since fresh from `days` so the window is always anchored to now,
    // not the snapshot RPC's slightly-earlier computation time.
    const since = days != null
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : sinceUtc;
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { data, error } = await admin.rpc("ops_online_users_by_day", {
      p_since: since,
      p_until: until,
    });

    if (error) {
      console.error("ops_online_users_by_day", error);
      // Fall back to direct table query if RPC doesn't exist yet
      return fetchOnlineUsersByDayFallback(admin, since, until);
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[online-series day] RPC returned empty. since=${since} until=${until}`);
      return [];
    }

    console.log(`[online-series day] RPC rows=${data.length} first=${JSON.stringify(data[0])} last=${JSON.stringify(data[data.length-1])}`);
    return (data as { day: string; peak: number; avg_count: number }[]).map((row) => ({
      date: String(row.day).slice(0, 10),
      peak: Number(row.peak) || 0,
      avg: Math.round(Number(row.avg_count) * 10) / 10,
    }));
  } catch (e) {
    console.error("fetchOnlineUsersByDay", e);
    return [];
  }
}

/**
 * Peak + average concurrent online users per UTC hour.
 * Used by the "Today" analytics view.
 */
export async function fetchOnlineUsersByHour(sinceUtc: string): Promise<OnlineHourPoint[]> {
  try {
    const admin = createServiceRoleClient();
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { data, error } = await admin.rpc("ops_online_users_by_hour", {
      p_since: sinceUtc,
      p_until: until,
    });

    if (error) {
      console.error("ops_online_users_by_hour", error);
      // Fallback: direct query for a single day is always under 1440 rows, safe.
      const { data: raw } = await admin
        .from("online_count_snapshots")
        .select("recorded_at,online_count")
        .gte("recorded_at", sinceUtc)
        .lte("recorded_at", until)
        .order("recorded_at", { ascending: true });
      if (!Array.isArray(raw) || raw.length === 0) return [];
      const byHour = new Map<string, { peak: number; sum: number; n: number }>();
      for (const row of raw) {
        const d = new Date(String(row.recorded_at));
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const key = `${d.toISOString().slice(0, 10)}T${hh}`;
        const count = Number(row.online_count) || 0;
        const cur = byHour.get(key) ?? { peak: 0, sum: 0, n: 0 };
        cur.peak = Math.max(cur.peak, count);
        cur.sum += count;
        cur.n += 1;
        byHour.set(key, cur);
      }
      return [...byHour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({
          hour: `${key.slice(11, 13)}:00`,
          peak: v.peak,
          avg: Math.round((v.sum / v.n) * 10) / 10,
        }));
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[online-series hour] RPC returned empty. since=${sinceUtc}`);
      return [];
    }

    return (data as { hour_bucket: string; peak: number; avg_count: number }[]).map((row) => {
      // hour_bucket is a timestamptz — extract the UTC hour for display.
      const d = new Date(row.hour_bucket);
      const hh = String(d.getUTCHours()).padStart(2, "0");
      return {
        hour: `${hh}:00`,
        peak: Number(row.peak) || 0,
        avg: Math.round(Number(row.avg_count) * 10) / 10,
      };
    });
  } catch (e) {
    console.error("fetchOnlineUsersByHour", e);
    return [];
  }
}
