"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Shield, Ban, CheckCircle, XCircle } from "lucide-react";

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
};

export default function OpsModerationPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [isCheckingCookie, setIsCheckingCookie] = useState(true);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const loadData = useCallback(async () => {
    const res = await fetch("/api/ops/moderation?status=open");
    if (!res.ok) return;
    const data = (await res.json()) as { reports: Report[]; blocks: Block[] };
    setReports(data.reports ?? []);
    setBlocks(data.blocks ?? []);
  }, []);

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
    if (unlocked) void loadData();
  }, [unlocked, loadData]);

  const modAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/ops/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) void loadData();
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
          <p className="mt-10 text-sm text-navy-400">Checking authentication…</p>
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
            <section>
              <h2 className="text-lg font-semibold text-white">Open reports ({reports.length})</h2>
              {reports.length === 0 ? (
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
              <h2 className="text-lg font-semibold text-white">Active blocks ({blocks.length})</h2>
              {blocks.length === 0 ? (
                <p className="mt-4 text-sm text-navy-400">No active blocks.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {blocks.map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase text-navy-300">
                          {b.block_type}
                        </span>
                        <span className="ml-2 font-mono text-sm text-white">{b.block_value}</span>
                        {b.reason ? (
                          <p className="mt-1 text-xs text-navy-400">{b.reason}</p>
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
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white">Manual block</h2>
              <ManualBlockForm onBlock={() => void loadData()} />
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
