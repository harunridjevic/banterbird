import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OnlineDayPoint } from "@/lib/ops/analytics-types";

/** Peak + average concurrent online users per UTC day from minute snapshots. */
export async function fetchOnlineUsersByDay(sinceUtc: string): Promise<OnlineDayPoint[]> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("online_count_snapshots")
      .select("recorded_at,online_count")
      .gte("recorded_at", sinceUtc)
      .order("recorded_at", { ascending: true });

    if (error || !data?.length) {
      if (error) console.error("online_count_snapshots", error);
      return [];
    }

    const byDay = new Map<string, { peak: number; sum: number; n: number }>();
    for (const row of data) {
      const date = String(row.recorded_at).slice(0, 10);
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
