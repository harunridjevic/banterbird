import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OnlineDayPoint, OnlineHourPoint } from "@/lib/ops/analytics-types";

/** Peak + average concurrent online users per UTC day from minute snapshots. */
export async function fetchOnlineUsersByDay(sinceUtc: string, days?: number): Promise<OnlineDayPoint[]> {
  try {
    const admin = createServiceRoleClient();

    // Recompute sinceUtc from `days` when provided so the window is always
    // anchored to the current server time rather than the snapshot RPC time,
    // which can lag by a few seconds and occasionally miss the current day.
    const since = days != null
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : sinceUtc;
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // now + 5 min buffer

    const { data, error } = await admin
      .from("online_count_snapshots")
      .select("recorded_at,online_count")
      .gte("recorded_at", since)
      .lte("recorded_at", until)
      .order("recorded_at", { ascending: true });

    if (error || !data?.length) {
      if (error) console.error("online_count_snapshots", error);
      return [];
    }

    const byDay = new Map<string, { peak: number; sum: number; n: number }>();
    for (const row of data) {
      // recorded_at may come back as "2026-07-22T18:03:00+00:00" or
      // "2026-07-22 18:03:00+00" — normalise to UTC date string.
      const raw = String(row.recorded_at);
      // Replace space separator and strip timezone offset before slicing.
      const isoLike = raw.replace(" ", "T");
      // Parse as a proper Date so timezone offsets are handled correctly.
      const d = new Date(isoLike);
      const date = d.toISOString().slice(0, 10); // always YYYY-MM-DD in UTC
      const count = Number(row.online_count) || 0;
      const cur = byDay.get(date) ?? { peak: 0, sum: 0, n: 0 };
      cur.peak = Math.max(cur.peak, count);
      cur.sum += count;
      cur.n += 1;
      byDay.set(date, cur);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        peak: v.peak,
        avg: Math.round((v.sum / v.n) * 10) / 10,
      }));
  } catch (e) {
    console.error("fetchOnlineUsersByDay", e);
    return [];
  }
}

/**
 * Peak + average concurrent online users per UTC hour for the current calendar
 * day. Used by the "Today" analytics view.
 */
export async function fetchOnlineUsersByHour(sinceUtc: string): Promise<OnlineHourPoint[]> {
  try {
    const admin = createServiceRoleClient();
    const untilUtc = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("online_count_snapshots")
      .select("recorded_at,online_count")
      .gte("recorded_at", sinceUtc)
      .lte("recorded_at", untilUtc)
      .order("recorded_at", { ascending: true });

    if (error || !data?.length) {
      if (error) console.error("online_count_snapshots (hourly)", error);
      return [];
    }

    // Group by "YYYY-MM-DDTHH" (the hour bucket).
    const byHour = new Map<string, { peak: number; sum: number; n: number }>();
    for (const row of data) {
      const raw = String(row.recorded_at);
      const isoLike = raw.replace(" ", "T");
      const d = new Date(isoLike);
      // Use UTC hour so the bucket always aligns with UTC regardless of offset.
      const hourKey = d.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
      const count = Number(row.online_count) || 0;
      const cur = byHour.get(hourKey) ?? { peak: 0, sum: 0, n: 0 };
      cur.peak = Math.max(cur.peak, count);
      cur.sum += count;
      cur.n += 1;
      byHour.set(hourKey, cur);
    }

    return [...byHour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hourKey, v]) => ({
        // Display label: "14:00"
        hour: `${hourKey.slice(11, 13)}:00`,
        peak: v.peak,
        avg: Math.round((v.sum / v.n) * 10) / 10,
      }));
  } catch (e) {
    console.error("fetchOnlineUsersByHour", e);
    return [];
  }
}
