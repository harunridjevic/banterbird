"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Shield, Ban, CheckCircle, XCircle } from "lucide-react";
import { OpsLoadingPanel, PAGE_SIZE } from "@/components/ops/OpsLoadingPanel";
import type { LlmGuardSettings } from "@/lib/ops/app-settings";

type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  room_id: string | null;
  reason: string;
  transcript: { role: string; content: string; at?: string }[];
  status: string;
  created_at: string;
  reporter_device_id: string | null;
  reported_device_id: string | null;
};

type Block = {
  id: string;
  block_type: string;
  block_value: string;
  reason: string | null;
  created_at: string;
  created_by: string | null;
};

type UserUsage = {
  apiCalls: number;
  rooms: number;
  sessionMinutes: number;
};

type TopIpUsage = {
  clientIp: string;
  apiCalls: number;
  distinctUsers: number;
  estimatedCostUsd: number;
  lastSeenAt: string | null;
  blocked: boolean;
};

export default function OpsModerationPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [isCheckingCookie, setIsCheckingCookie] = useState(true);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [usageByUser, setUsageByUser] = useState<Record<string, UserUsage>>({});
  const [blocksTotal, setBlocksTotal] = useState(0);
  const [blocksHasMore, setBlocksHasMore] = useState(false);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [loadingMoreBlocks, setLoadingMoreBlocks] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [topIps, setTopIps] = useState<TopIpUsage[]>([]);
  const [ipHours, setIpHours] = useState(24);
  const [llmGuards, setLlmGuards] = useState<LlmGuardSettings | null>(null);
  const [llmGuardsSaving, setLlmGuardsSaving] = useState(false);

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
        setError(j.error ?? "Unlock failed");
        return;
      }
      setUnlocked(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [password]);

  const loadBlocks = useCallback(async (offset = 0, append = false, hours = ipHours) => {
    if (append) setLoadingMoreBlocks(true);
    else setLoadingBlocks(true);
    try {
      const qs = new URLSearchParams({
        status: "open",
        blocksLimit: String(PAGE_SIZE),
        blocksOffset: String(offset),
        ipHours: String(hours),
      });
      const res = await fetch(`/api/ops/moderation?${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        reports: Report[];
        blocks: Block[];
        usageByUser?: Record<string, UserUsage>;
        blocksTotal?: number;
        blocksHasMore?: boolean;
        topIps?: TopIpUsage[];
        llmGuards?: LlmGuardSettings;
      };
      if (!append) setReports(data.reports ?? []);
      setBlocks((prev) => (append ? [...prev, ...(data.blocks ?? [])] : (data.blocks ?? [])));
      setUsageByUser((prev) => ({ ...prev, ...(data.usageByUser ?? {}) }));
      setBlocksTotal(data.blocksTotal ?? (data.blocks ?? []).length);
      setBlocksHasMore(data.blocksHasMore ?? false);
      if (!append) {
        setTopIps(data.topIps ?? []);
        if (data.llmGuards) setLlmGuards(data.llmGuards);
      }
    } finally {
      if (append) setLoadingMoreBlocks(false);
      else setLoadingBlocks(false);
    }
  }, [ipHours]);

  const patchLlmGuards = useCallback(async (partial: Partial<LlmGuardSettings>) => {
    if (!llmGuards) return;
    const next = { ...llmGuards, ...partial };
    setLlmGuards(next);
    setLlmGuardsSaving(true);
    try {
      const res = await fetch("/api/ops/app-settings");
      if (!res.ok) return;
      const appSettings = (await res.json()) as { llmGuards?: LlmGuardSettings };
      const saveRes = await fetch("/api/ops/app-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...appSettings, llmGuards: next }),
      });
      if (saveRes.ok) {
        const saved = (await saveRes.json()) as { llmGuards: LlmGuardSettings };
        setLlmGuards(saved.llmGuards);
      }
    } finally {
      setLlmGuardsSaving(false);
    }
  }, [llmGuards]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ops/analytics/data?period=month&days=30");
        if (res.ok) setUnlocked(true);
      } finally {
        setIsCheckingCookie(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (unlocked) void loadBlocks(0, false, ipHours);
  }, [unlocked, ipHours, loadBlocks]);

  const modAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/ops/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) void loadBlocks(0, false, ipHours);
  };

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-violet-400" />
          <h1 className="text-2xl font-bold text-white">Moderation</h1>
        </div>
        <p className="mt-2 text-sm text-navy-300">Review reports, block users, IPs, or devices.</p>

        {isCheckingCookie ? (
          <OpsLoadingPanel label="Checking authentication…" compact />
        ) : !unlocked ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-navy-900/40 p-6">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void unlock()}
              placeholder="Ops password"
              className="w-full max-w-sm rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white"
            />
            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            <button
              type="button"
              disabled={loading || !password}
              onClick={() => void unlock()}
              className="mt-4 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Unlock
            </button>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {llmGuards ? (
              <section className="rounded-2xl border border-white/10 bg-navy-900/40 p-5">
                <h2 className="text-lg font-semibold text-white">LLM auto-block</h2>
                <p className="mt-1 text-sm text-navy-400">
                  Only blocks obvious cost-attack patterns. Soft caps still fall back to canned bot replies.
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={llmGuards.autoBlockEnabled}
                    onChange={(e) => void patchLlmGuards({ autoBlockEnabled: e.target.checked })}
                    className="mt-1 accent-violet-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-navy-100">Enable automatic user blocks</span>
                    <span className="mt-1 block text-xs text-navy-400">
                      When off, abuse patterns are logged but users are not auto-blocked.
                    </span>
                  </span>
                </label>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-navy-200">Sensitivity</span>
                    <select
                      value={llmGuards.sensitivity}
                      onChange={(e) =>
                        void patchLlmGuards({
                          sensitivity: e.target.value as LlmGuardSettings["sensitivity"],
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      <option value="low">Low — only extreme abuse</option>
                      <option value="medium">Medium — balanced</option>
                      <option value="high">High — catch abuse sooner</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-navy-200">Cost block threshold (USD / day)</span>
                    <input
                      type="number"
                      min={0.5}
                      max={100}
                      step={0.5}
                      value={llmGuards.autoBlockCostUsdDay}
                      onChange={(e) =>
                        void patchLlmGuards({
                          autoBlockCostUsdDay: Number.parseFloat(e.target.value) || 5,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-navy-200">Soft hourly cap (canned replies)</span>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      value={llmGuards.softHourlyCap}
                      onChange={(e) =>
                        void patchLlmGuards({
                          softHourlyCap: Number.parseInt(e.target.value, 10) || 100,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-navy-200">Soft daily cap (canned replies)</span>
                    <input
                      type="number"
                      min={20}
                      max={5000}
                      value={llmGuards.softDailyCap}
                      onChange={(e) =>
                        void patchLlmGuards({
                          softDailyCap: Number.parseInt(e.target.value, 10) || 250,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>
                {llmGuardsSaving ? (
                  <p className="mt-3 text-xs text-violet-300">Saving…</p>
                ) : null}
              </section>
            ) : null}

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Highest usage IPs</h2>
                <div className="flex gap-2">
                  {[24, 168].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => setIpHours(hours)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        ipHours === hours
                          ? "bg-violet-600 text-white"
                          : "border border-white/10 text-navy-300 hover:bg-white/5"
                      }`}
                    >
                      {hours === 24 ? "24h" : "7d"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-sm text-navy-400">
                Ranked by API calls. Block suspicious IPs manually below.
              </p>
              {loadingBlocks && topIps.length === 0 ? (
                <OpsLoadingPanel label="Loading IP usage…" compact />
              ) : topIps.length === 0 ? (
                <p className="mt-4 text-sm text-navy-400">
                  No IP usage logged yet. IPs appear after the migration runs and new API calls come in.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {topIps.map((row) => (
                    <li
                      key={row.clientIp}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div>
                        <span className="font-mono text-sm text-white">{row.clientIp}</span>
                        {row.blocked ? (
                          <span className="ml-2 rounded bg-rose-500/20 px-2 py-0.5 text-xs uppercase text-rose-200">
                            blocked
                          </span>
                        ) : null}
                        <p className="mt-1 text-xs text-navy-300">
                          {row.apiCalls} API calls · {row.distinctUsers} user
                          {row.distinctUsers === 1 ? "" : "s"} · est. ${row.estimatedCostUsd.toFixed(4)}
                          {row.lastSeenAt
                            ? ` · last ${new Date(row.lastSeenAt).toLocaleString()}`
                            : null}
                        </p>
                      </div>
                      {!row.blocked ? (
                        <button
                          type="button"
                          onClick={() =>
                            void modAction({
                              action: "block",
                              blockType: "ip",
                              blockValue: row.clientIp,
                              reason: `High API usage (${row.apiCalls} calls in ${ipHours}h)`,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                        >
                          <Ban className="h-3 w-3" /> Block IP
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">Open reports ({reports.length})</h2>
              {loadingBlocks && reports.length === 0 ? (
                <OpsLoadingPanel label="Loading reports…" compact />
              ) : reports.length === 0 ? (
                <p className="mt-4 text-sm text-navy-400">No open reports.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {reports.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-white/10 bg-navy-900/40 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{r.reason}</p>
                          <p className="mt-1 text-xs text-navy-400">
                            {new Date(r.created_at).toLocaleString()} · room {r.room_id?.slice(0, 8)}…
                          </p>
                          {r.reported_user_id ? (
                            <p className="mt-1 font-mono text-xs text-navy-500">
                              User: {r.reported_user_id}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-violet-300">AI / unknown peer</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-navy-200 hover:bg-white/5"
                          >
                            {expandedId === r.id ? "Hide" : "Transcript"}
                          </button>
                          {r.reported_user_id ? (
                            <button
                              type="button"
                              onClick={() =>
                                void modAction({
                                  action: "blockAll",
                                  reportId: r.id,
                                  reason: r.reason,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                            >
                              <Ban className="h-3 w-3" /> Block user &amp; device
                            </button>
                          ) : null}
                          {r.reported_device_id ? (
                            <button
                              type="button"
                              onClick={() =>
                                void modAction({
                                  action: "block",
                                  reportId: r.id,
                                  blockType: "device",
                                  blockValue: r.reported_device_id,
                                  reason: r.reason,
                                })
                              }
                              className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10"
                            >
                              Block device
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void modAction({ action: "review", reportId: r.id })}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/10"
                          >
                            <CheckCircle className="h-3 w-3" /> Reviewed
                          </button>
                          <button
                            type="button"
                            onClick={() => void modAction({ action: "dismiss", reportId: r.id })}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-navy-300 hover:bg-white/5"
                          >
                            <XCircle className="h-3 w-3" /> Dismiss
                          </button>
                        </div>
                      </div>
                      {expandedId === r.id ? (
                        <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-navy-200">
                          {JSON.stringify(r.transcript, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">
                Active blocks ({blocksTotal || blocks.length})
              </h2>
              {loadingBlocks && blocks.length === 0 ? (
                <OpsLoadingPanel label="Loading blocked users…" compact />
              ) : blocks.length === 0 ? (
                <p className="mt-4 text-sm text-navy-400">No active blocks.</p>
              ) : (
                <>
                  <ul className="mt-4 space-y-2">
                    {blocks.map((b) => {
                      const usage =
                        b.block_type === "user" ? usageByUser[b.block_value] : undefined;
                      const autoBlocked =
                        b.created_by === "rate_limit" || b.created_by === "llm_overusage";
                      return (
                        <li
                          key={b.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                        >
                          <div>
                            <span className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase text-navy-300">
                              {b.block_type}
                            </span>
                            {autoBlocked ? (
                              <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-xs uppercase text-amber-200">
                                auto
                              </span>
                            ) : null}
                            <span className="ml-2 font-mono text-sm text-white">{b.block_value}</span>
                            {b.reason ? (
                              <p className="mt-1 text-xs text-navy-400">{b.reason}</p>
                            ) : null}
                            {usage ? (
                              <p className="mt-1 text-xs text-navy-300">
                                API calls: {usage.apiCalls} · Rooms: {usage.rooms} · Online time:{" "}
                                {usage.sessionMinutes} min
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void modAction({ action: "unblock", blockId: b.id })}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-navy-200 hover:bg-white/5"
                          >
                            Unblock
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {blocksHasMore ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        disabled={loadingMoreBlocks}
                        onClick={() => void loadBlocks(blocks.length, true)}
                        className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-navy-100 hover:bg-white/10 disabled:opacity-50"
                      >
                        {loadingMoreBlocks
                          ? "Loading…"
                          : `Load more (${blocks.length} of ${blocksTotal})`}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">Manual block</h2>
              <ManualBlockForm onBlock={() => void loadBlocks(0, false)} />
            </section>
          </div>
        )}

        <p className="mt-10 text-xs text-navy-500">
          <Link href="/ops" className="text-navy-400 hover:underline">
            ← Ops dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}

function ManualBlockForm({ onBlock }: { onBlock: () => void }) {
  const [blockType, setBlockType] = useState<"ip" | "device" | "user">("ip");
  const [blockValue, setBlockValue] = useState("");
  const [reason, setReason] = useState("");

  const submit = async () => {
    if (!blockValue.trim()) return;
    await fetch("/api/ops/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "block",
        blockType,
        blockValue: blockValue.trim(),
        reason: reason.trim() || null,
      }),
    });
    setBlockValue("");
    setReason("");
    onBlock();
  };

  return (
    <div className="mt-4 flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-navy-900/40 p-5">
      <select
        value={blockType}
        onChange={(e) => setBlockType(e.target.value as "ip" | "device" | "user")}
        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
      >
        <option value="ip">IP address</option>
        <option value="device">Device ID</option>
        <option value="user">User ID</option>
      </select>
      <input
        value={blockValue}
        onChange={(e) => setBlockValue(e.target.value)}
        placeholder="Value to block"
        className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
      />
      <button
        type="button"
        onClick={() => void submit()}
        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
      >
        Block
      </button>
    </div>
  );
}
