"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiUsageChart, ApiCostChart, RoomsChart, UniqueUsersChart } from "@/components/ops/AnalyticsCharts";
import { MetricCard } from "@/components/ops/MetricCard";
import {
  type AnalyticsPeriod,
  type AnalyticsSnapshot,
  formatSinceUtc,
  METRIC_TOOLTIPS,
  periodLabel,
  resolvePeriodDays,
} from "@/lib/ops/analytics-types";
import { useOnlineCount } from "@/lib/ops/use-online-count";

function fmtNum(n: number | null | undefined, suffix = ""): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${n}${suffix}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  if (n < 0.01 && n > 0) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const PERIODS: { id: AnalyticsPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "year", label: "Year" },
  { id: "custom", label: "Custom" },
];

export default function OpsAnalyticsPage() {
  const liveOnlineCount = useOnlineCount();
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [customDays, setCustomDays] = useState(30);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isCheckingCookie, setIsCheckingCookie] = useState(true);

  const days = resolvePeriodDays(period, customDays);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period, days: String(days) });
      const res = await fetch(`/api/ops/analytics/data?${qs}`, { method: "GET" });
      if (res.status === 401) {
        setUnlocked(false);
        setSnapshot(null);
        setError("Session expired. Enter the password again.");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Load failed (${res.status})`);
        return;
      }
      const j = (await res.json()) as { snapshot?: AnalyticsSnapshot };
      setSnapshot(j.snapshot ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [period, days]);

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

  const resetData = useCallback(async () => {
    setResetMsg(null);
    setError(null);
    setResetting(true);
    try {
      const res = await fetch("/api/ops/analytics/reset", { method: "POST" });
      if (res.status === 401) {
        setUnlocked(false);
        setError("Session expired. Enter the password again.");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Reset failed (${res.status})`);
        return;
      }
      const j = (await res.json()) as { usersDeleted?: number };
      setConfirmReset(false);
      setResetMsg(`All test data reset. ${j.usersDeleted ?? 0} auth users removed.`);
      await load();
    } catch {
      setError("Network error during reset");
    } finally {
      setResetting(false);
    }
  }, [load]);

  useEffect(() => {
    setIsCheckingCookie(true);
    // Check if cookie exists and is valid by making a test request
    void (async () => {
      try {
        const qs = new URLSearchParams({ period: "month", days: "30" });
        const res = await fetch(`/api/ops/analytics/data?${qs}`, { method: "GET" });
        if (res.ok) {
          setUnlocked(true);
          const j = (await res.json()) as { snapshot?: AnalyticsSnapshot };
          setSnapshot(j.snapshot ?? null);
        }
      } catch {
        // Cookie not valid or network error - stay locked
      } finally {
        setIsCheckingCookie(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    void load();
  }, [unlocked, period, days, load]);

  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [unlocked, load]);

  const providerEntries = snapshot
    ? Object.entries(snapshot.apiUsage.byProvider).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
              <Link
                href="/ops"
                className="text-sm text-navy-400 underline-offset-2 hover:text-navy-200 hover:underline"
              >
                ← Ops
              </Link>
            </div>
            <p className="mt-2 text-sm text-navy-300">
              Key product metrics. All dates are <strong className="font-medium text-navy-200">UTC</strong>.
              Hover <span className="text-navy-400">?</span> for definitions.
            </p>
          </div>
          {unlocked && snapshot ? (
            <p className="text-xs text-navy-500">
              Updated {new Date(snapshot.computedAtUtc).toLocaleString()}
            </p>
          ) : null}
        </div>

        {isCheckingCookie ? (
          <div className="mt-10 flex items-center justify-center rounded-2xl border border-white/10 bg-navy-900/40 p-6">
            <p className="text-sm text-navy-400">Checking authentication…</p>
          </div>
        ) : !unlocked ? (
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
              className="mt-2 w-full max-w-sm rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-violet-500/40 focus:ring-2"
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
            <div className="mt-8 flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      period === p.id
                        ? "bg-violet-600 text-white"
                        : "text-navy-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {period === "custom" ? (
                <div>
                  <label htmlFor="ops-days" className="sr-only">
                    Custom days
                  </label>
                  <input
                    id="ops-days"
                    type="number"
                    min={1}
                    max={365}
                    value={customDays}
                    onChange={(e) => setCustomDays(Number.parseInt(e.target.value, 10) || 30)}
                    className="w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                  />
                </div>
              ) : null}

              <button
                type="button"
                disabled={loading}
                onClick={() => void load()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Refresh"}
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => setConfirmReset(true)}
                  className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-950/50 disabled:opacity-50"
                >
                  Reset test data
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-300">Delete all rooms, messages, users?</span>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => void resetData()}
                    className="rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {resetting ? "Resetting…" : "Confirm reset"}
                  </button>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => setConfirmReset(false)}
                    className="text-sm text-navy-400 hover:text-navy-200"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
            {resetMsg ? <p className="mt-4 text-sm text-emerald-300">{resetMsg}</p> : null}

            {snapshot ? (
              <div className="mt-8 space-y-8">
                <p className="text-sm text-navy-400">
                  Showing <span className="text-navy-200">{periodLabel(period, days)}</span>
                  {snapshot.sinceUtc ? (
                    <span className="text-navy-500">
                      {" "}
                      · from {formatSinceUtc(snapshot.sinceUtc)}
                    </span>
                  ) : null}
                </p>

                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
                    Live
                  </h2>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      label="Online now"
                      value={fmtNum(liveOnlineCount)}
                      tooltip={METRIC_TOOLTIPS.onlineUsersNow}
                      accent="emerald"
                    />
                    <MetricCard
                      label="Unique users"
                      value={fmtNum(snapshot.uniqueUsers)}
                      tooltip={METRIC_TOOLTIPS.uniqueUsers}
                    />
                    <MetricCard
                      label="Recurring users"
                      value={fmtNum(snapshot.recurringUsers)}
                      tooltip={METRIC_TOOLTIPS.recurringUsers}
                      accent="sky"
                    />
                    <MetricCard
                      label="Avg time per user"
                      value={`${fmtNum(snapshot.avgUserSessionMinutes)} min`}
                      tooltip={METRIC_TOOLTIPS.avgUserSessionMinutes}
                    />
                    <MetricCard
                      label="Total time (all users)"
                      value={`${fmtNum(snapshot.totalUserSessionMinutes)} min`}
                      tooltip={METRIC_TOOLTIPS.totalUserSessionMinutes}
                      accent="violet"
                    />
                    <MetricCard
                      label="First-chat churn"
                      value={fmtPct(snapshot.bounceRate)}
                      tooltip={METRIC_TOOLTIPS.bounceRate}
                      accent="rose"
                    />
                    <MetricCard
                      label="New users (1st chat)"
                      value={fmtNum(snapshot.firstChatUsers)}
                      tooltip={METRIC_TOOLTIPS.firstChatUsers}
                    />
                    <MetricCard
                      label="Churned / finished 1st"
                      value={
                        snapshot.firstChatEndedUsers > 0
                          ? `${fmtNum(snapshot.bouncedUsers)} / ${fmtNum(snapshot.firstChatEndedUsers)}`
                          : snapshot.firstChatUsers > 0
                            ? `0 / ${fmtNum(snapshot.firstChatUsers)} (in progress)`
                            : "-"
                      }
                      tooltip={METRIC_TOOLTIPS.bouncedUsers}
                    />
                    <MetricCard
                      label="Rematched after 1st"
                      value={fmtNum(snapshot.firstChatRetainedUsers ?? 0)}
                      tooltip={METRIC_TOOLTIPS.firstChatRetainedUsers}
                      accent="emerald"
                    />
                  </dl>
                </section>

                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
                    Chats & rooms
                  </h2>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard
                      label="Human chats"
                      value={fmtNum(snapshot.humanChats)}
                      tooltip={METRIC_TOOLTIPS.humanChats}
                      accent="emerald"
                    />
                    <MetricCard
                      label="Bot chats"
                      value={fmtNum(snapshot.botChats)}
                      tooltip={METRIC_TOOLTIPS.botChats}
                      accent="amber"
                    />
                    <MetricCard
                      label="Total rooms"
                      value={fmtNum(snapshot.totalRooms)}
                      tooltip={METRIC_TOOLTIPS.totalRooms}
                    />
                    <MetricCard
                      label="Avg human room time"
                      value={`${fmtNum(snapshot.avgHumanRoomMinutes)} min`}
                      tooltip={METRIC_TOOLTIPS.avgHumanRoomMinutes}
                      accent="emerald"
                    />
                    <MetricCard
                      label="Avg bot room time"
                      value={`${fmtNum(snapshot.avgBotRoomMinutes)} min`}
                      tooltip={METRIC_TOOLTIPS.avgBotRoomMinutes}
                      accent="amber"
                    />
                    <MetricCard
                      label="Human vs bot split"
                      value={
                        snapshot.totalRooms > 0
                          ? `${fmtPct(snapshot.humanChats / snapshot.totalRooms)} human`
                          : "-"
                      }
                      tooltip="Percentage of rooms that were matched with a real person vs practice bot."
                    />
                  </dl>
                </section>

                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
                    API usage
                  </h2>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      label="Total API calls"
                      value={fmtNum(snapshot.apiUsage.totalCalls)}
                      tooltip={METRIC_TOOLTIPS.apiTotalCalls}
                      accent="sky"
                    />
                    <MetricCard
                      label="Success rate"
                      value={fmtPct(snapshot.apiUsage.successRate)}
                      tooltip={METRIC_TOOLTIPS.apiSuccessRate}
                    />
                    <MetricCard
                      label="Avg latency"
                      value={`${fmtNum(snapshot.apiUsage.avgLatencyMs)} ms`}
                      tooltip={METRIC_TOOLTIPS.apiAvgLatency}
                    />
                    <MetricCard
                      label="Failed calls"
                      value={fmtNum(snapshot.apiUsage.errorCalls)}
                      tooltip="AI API calls that returned an error or fell back to local responses."
                    />
                    <MetricCard
                      label="Total tokens"
                      value={fmtTokens(snapshot.apiUsage.totalTokens)}
                      tooltip={METRIC_TOOLTIPS.apiTotalTokens}
                      accent="amber"
                    />
                    <MetricCard
                      label="Est. API cost"
                      value={fmtUsd(snapshot.apiUsage.estimatedCostUsd)}
                      tooltip={METRIC_TOOLTIPS.apiEstimatedCost}
                      accent="amber"
                    />
                    <MetricCard
                      label="Tokens per user"
                      value={fmtTokens(snapshot.apiUsage.avgTokensPerUser)}
                      tooltip={METRIC_TOOLTIPS.apiAvgTokensPerUser}
                      accent="amber"
                    />
                    <MetricCard
                      label="Users with API calls"
                      value={fmtNum(snapshot.apiUsage.usersWithApiCalls)}
                      tooltip="Distinct users who triggered at least one Groq/Gemini/OpenAI call in the window."
                    />
                  </dl>
                  {providerEntries.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-3 text-sm text-navy-300">
                      {providerEntries.map(([name, count]) => (
                        <li
                          key={name}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5"
                        >
                          <span className="capitalize text-navy-400">{name}</span>{" "}
                          <span className="font-medium text-white">{count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
                    Trends
                  </h2>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <UniqueUsersChart snapshot={snapshot} />
                    <RoomsChart snapshot={snapshot} />
                    <div className="lg:col-span-2">
                      <ApiUsageChart snapshot={snapshot} />
                    </div>
                    <div className="lg:col-span-2">
                      <ApiCostChart snapshot={snapshot} />
                    </div>
                  </div>
                </section>
              </div>
            ) : loading ? (
              <p className="mt-8 text-sm text-navy-400">Loading metrics…</p>
            ) : !error ? (
              <p className="mt-8 text-sm text-navy-400">No data yet.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
