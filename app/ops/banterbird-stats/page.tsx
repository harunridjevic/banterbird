"use client";

import { useCallback, useMemo, useState } from "react";

type Snapshot = Record<string, unknown>;

function fmtPct(n: unknown): string {
  if (n === null || n === undefined || typeof n !== "number" || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(n: unknown, suffix = ""): string {
  if (n === null || n === undefined || (typeof n !== "number" && typeof n !== "string")) return "—";
  const x = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(x)) return "—";
  return `${x}${suffix}`;
}

export default function OpsAnalyticsPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/analytics/data?days=${days}`, { method: "GET" });
      if (res.status === 401) {
        setUnlocked(false);
        setSnapshot(null);
        setError("Session expired or invalid — enter the password again.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Load failed (${res.status})`);
        setLoading(false);
        return;
      }
      const j = (await res.json()) as { snapshot?: Snapshot };
      setSnapshot(j.snapshot ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [days]);

  const unlock = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ops/analytics/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Unlock failed (${res.status})`);
        return;
      }
      setUnlocked(true);
      await load();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [password, load]);

  const totals = useMemo(() => {
    const t = snapshot?.totals;
    return t && typeof t === "object" ? (t as Record<string, unknown>) : null;
  }, [snapshot]);

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">BanterBird analytics</h1>
        <p className="mt-2 text-sm text-navy-300">
          Internal dashboard. Not linked from the app. All dates and DAU are <strong className="font-medium text-navy-200">UTC</strong>.
        </p>

        {!unlocked ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-navy-900/40 p-6">
            <label htmlFor="ops-pw" className="block text-sm font-medium text-navy-200">
              Password
            </label>
            <input
              id="ops-pw"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock();
              }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-violet-500/40 focus:ring-2"
            />
            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            <button
              type="button"
              disabled={loading || !password}
              onClick={() => void unlock()}
              className="mt-4 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loading ? "Checking…" : "Unlock"}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="ops-days" className="block text-xs font-medium uppercase tracking-wide text-navy-400">
                  Window (days)
                </label>
                <input
                  id="ops-days"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number.parseInt(e.target.value, 10) || 30)}
                  className="mt-1 w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void load()}
                className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {loading ? "Loading…" : snapshot ? "Refresh" : "Load metrics"}
              </button>
            </div>
            {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

            {snapshot ? (
              <div className="mt-10 space-y-8">
                <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-6">
                  <h2 className="text-lg font-semibold text-white">Engagement</h2>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Metric label="DAU (today, UTC)" value={fmtNum(snapshot.dauTodayUtc)} hint="Distinct users with a room or human message that UTC day." />
                    <Metric label="DAU (yesterday, UTC)" value={fmtNum(snapshot.dauYesterdayUtc)} />
                    <Metric
                      label="D1 retention (signup cohort)"
                      value={fmtPct(snapshot.d1RetentionSignupCohort as number | null)}
                      hint={String(snapshot.d1RetentionNote ?? "")}
                    />
                    <Metric
                      label="Avg “session” (human room lifetime)"
                      value={`${fmtNum(snapshot.avgHumanEndedRoomMinutes)} min`}
                      hint="Ended human-human rooms: average time from room created to ended_at."
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-6">
                  <h2 className="text-lg font-semibold text-white">Matching & chats</h2>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Metric
                      label="Time to first human match (median)"
                      value={`${fmtNum(snapshot.timeToFirstHumanMatchMedianSeconds)} s`}
                      hint={String(snapshot.timeToFirstHumanMatchNote ?? "")}
                    />
                    <Metric
                      label="Matches per “session” (avg rooms / user)"
                      value={fmtNum(snapshot.avgRoomsPerUserInWindow)}
                      hint={String(snapshot.matchesPerSessionNote ?? "")}
                    />
                    <Metric
                      label="Conversation duration (avg)"
                      value={`${fmtNum(snapshot.conversationDurationAvgMinutesHumanRooms)} min`}
                      hint={String(snapshot.conversationDurationNote ?? "")}
                    />
                    <Metric
                      label="Skip rate (human ended rooms)"
                      value={fmtPct(snapshot.skipRateHumanEndedRooms as number | null)}
                      hint={String(snapshot.skipRateNote ?? "")}
                    />
                    <Metric
                      label="AI fallback rate"
                      value={fmtPct(snapshot.aiFallbackRate as number | null)}
                      hint={String(snapshot.aiFallbackNote ?? "")}
                    />
                  </dl>
                </section>

                {totals ? (
                  <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-6">
                    <h2 className="text-lg font-semibold text-white">Totals (window)</h2>
                    <ul className="mt-3 grid gap-2 text-sm text-navy-200 sm:grid-cols-2">
                      <li>Rooms created: {fmtNum(totals.roomsCreated)}</li>
                      <li>Human rooms: {fmtNum(totals.humanRooms)}</li>
                      <li>AI practice rooms: {fmtNum(totals.aiRooms)}</li>
                      <li>Human rooms ended: {fmtNum(totals.humanEndedRooms)}</li>
                      <li>Ended like “skip” (no msgs or &lt;20s): {fmtNum(totals.skippedLikeEndedRooms)}</li>
                    </ul>
                  </section>
                ) : null}

                <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-6">
                  <h2 className="text-lg font-semibold text-white">DAU by day (UTC)</h2>
                  <DauTable rows={snapshot.dauByDayUtc} />
                </section>
              </div>
            ) : unlocked && !loading && !error ? (
              <p className="mt-8 text-sm text-navy-400">Choose a window and press Load metrics.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-navy-400">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-white">{value}</dd>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-navy-400">{hint}</p> : null}
    </div>
  );
}

function DauTable({ rows }: { rows: unknown }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="mt-3 text-sm text-navy-400">No data.</p>;
  }
  const tail = rows.slice(-14);
  return (
    <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-white/5">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-navy-950/95 text-xs uppercase text-navy-400">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">DAU</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-navy-200">
          {tail.map((r, i) => {
            const row = r as { date?: string; dau?: number };
            return (
              <tr key={`${row.date ?? i}`}>
                <td className="px-3 py-2 font-mono text-xs">{row.date ?? "—"}</td>
                <td className="px-3 py-2">{row.dau ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-white/5 px-3 py-2 text-xs text-navy-500">Showing last 14 days of series.</p>
    </div>
  );
}
