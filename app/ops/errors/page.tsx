"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { OpsLoadingPanel, PAGE_SIZE } from "@/components/ops/OpsLoadingPanel";
import { OpsBackLink } from "@/components/ops/OpsBackLink";

type ErrorRow = {
  id: string;
  source: string;
  level: string;
  message: string;
  stack: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
};

export default function OpsErrorsPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/ops/errors?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        errors: ErrorRow[];
        hasMore?: boolean;
        total?: number;
      };
      const rows = data.errors ?? [];
      setErrors((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(data.hasMore ?? false);
      setTotal(data.total ?? rows.length);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ops/analytics/data?period=month&days=30");
        if (res.ok) {
          setUnlocked(true);
          void load(0, false);
        }
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [load]);

  const clearOne = async (id: string) => {
    const res = await fetch(`/api/ops/errors?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setErrors((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    }
  };

  const clearAll = async () => {
    if (!confirm("Clear all error logs?")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/ops/errors?all=1", { method: "DELETE" });
      if (res.ok) {
        setErrors([]);
        setHasMore(false);
        setTotal(0);
      }
    } finally {
      setClearing(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0c121c] text-navy-100">
        <OpsLoadingPanel label="Checking ops access…" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
        <div className="mx-auto max-w-4xl">
          <OpsBackLink />
          <p className="mt-4 text-sm text-navy-400">
            <Link href="/ops" className="underline-offset-2 hover:text-navy-200 hover:underline">
              Unlock ops first
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-4xl">
        <OpsBackLink />
        <div className="mt-4 flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Error monitoring</h1>
        </div>
        <p className="mt-2 text-sm text-navy-300">
          Recent server and client errors{total > 0 ? ` · ${total} total` : ""}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load(0, false)}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-navy-200 hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={clearing || errors.length === 0}
            onClick={() => void clearAll()}
            className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
          >
            {clearing ? "Clearing…" : "Clear all errors"}
          </button>
        </div>

        {loading && errors.length === 0 ? (
          <OpsLoadingPanel label="Loading error logs…" compact />
        ) : (
          <>
            <ul className="mt-6 space-y-3">
              {errors.map((e) => (
                <li key={e.id} className="rounded-xl border border-white/10 bg-navy-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                            e.level === "error"
                              ? "bg-rose-500/20 text-rose-200"
                              : e.level === "warn"
                                ? "bg-amber-500/20 text-amber-200"
                                : "bg-navy-500/20 text-navy-200"
                          }`}
                        >
                          {e.level}
                        </span>
                        <span className="font-mono text-xs text-violet-300">{e.source}</span>
                        <span className="text-xs text-navy-500">{new Date(e.created_at).toLocaleString()}</span>
                        {(e.metadata?.email || e.user_id) && (
                          <span className="rounded bg-navy-800/60 px-1.5 py-0.5 font-mono text-[11px] text-navy-300">
                            {String(e.metadata?.email ?? e.user_id ?? "")}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-white">{e.message}</p>
                      {e.stack ? (
                        <pre className="mt-2 max-h-32 overflow-auto text-xs text-navy-400">{e.stack}</pre>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label="Clear this error"
                      onClick={() => void clearOne(e.id)}
                      className="shrink-0 rounded-lg border border-white/10 p-1.5 text-navy-400 hover:bg-white/5 hover:text-rose-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {errors.length === 0 ? (
              <p className="mt-6 text-sm text-navy-500">No errors logged.</p>
            ) : null}
            {hasMore ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void load(errors.length, true)}
                  className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-navy-100 hover:bg-white/10 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : `Load more (${errors.length} of ${total})`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
