"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, KeyRound, Plus, Trash2 } from "lucide-react";
import type { ApiKeyProvider, OpsApiKeyPublic } from "@/lib/ops/api-keys-types";

export default function OpsApiKeysPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCookie, setIsCheckingCookie] = useState(true);
  const [keys, setKeys] = useState<OpsApiKeyPublic[]>([]);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState<ApiKeyProvider>("cerebras");
  const [newApiKey, setNewApiKey] = useState("");

  const loadKeys = useCallback(async () => {
    const res = await fetch("/api/ops/api-keys");
    if (!res.ok) return false;
    const j = (await res.json()) as { keys: OpsApiKeyPublic[] };
    setKeys(j.keys ?? []);
    return true;
  }, []);

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
      await loadKeys();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [password, loadKeys]);

  useEffect(() => {
    setIsCheckingCookie(true);
    void (async () => {
      try {
        const res = await fetch("/api/ops/analytics/data?period=month&days=30", { method: "GET" });
        if (res.ok) {
          setUnlocked(true);
          await loadKeys();
        }
      } catch {
        // stay locked
      } finally {
        setIsCheckingCookie(false);
      }
    })();
  }, [loadKeys]);

  // Refresh rate-limit status while unlocked
  useEffect(() => {
    if (!unlocked) return;
    const id = window.setInterval(() => {
      void loadKeys();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [unlocked, loadKeys]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/ops/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          keys?: OpsApiKeyPublic[];
          key?: OpsApiKeyPublic;
        };
        if (!res.ok) {
          setError(j.error ?? `Request failed (${res.status})`);
          return;
        }
        if (j.keys) setKeys(j.keys);
        else await loadKeys();
      } catch {
        setError("Network error");
      } finally {
        setSaving(false);
      }
    },
    [loadKeys],
  );

  const addKey = useCallback(async () => {
    if (!newApiKey.trim()) return;
    await postAction({
      name: newName.trim() || `${newProvider} key`,
      provider: newProvider,
      apiKey: newApiKey.trim(),
      priority: (keys.length + 1) * 10,
    });
    setNewName("");
    setNewApiKey("");
  }, [newApiKey, newName, newProvider, keys.length, postAction]);

  const move = useCallback(
    async (index: number, dir: -1 | 1) => {
      const next = index + dir;
      if (next < 0 || next >= keys.length) return;
      const ordered = keys.map((k) => k.id);
      const tmp = ordered[index];
      ordered[index] = ordered[next];
      ordered[next] = tmp;
      // Optimistic UI
      const reordered = [...keys];
      const [item] = reordered.splice(index, 1);
      reordered.splice(next, 0, item);
      setKeys(reordered.map((k, i) => ({ ...k, priority: (i + 1) * 10 })));
      await postAction({ action: "reorder", orderedIds: ordered });
    },
    [keys, postAction],
  );

  const formatUntil = (iso: string | null) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || t <= Date.now()) return null;
    const mins = Math.ceil((t - Date.now()) / 60_000);
    return mins <= 1 ? "<1 min" : `${mins} min`;
  };

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs text-navy-500">
          <Link href="/ops" className="underline-offset-2 hover:text-navy-200 hover:underline">
            ← Ops
          </Link>
        </p>
        <h1 className="mt-4 flex items-center gap-3 text-2xl font-bold tracking-tight text-white">
          <KeyRound className="h-7 w-7 text-violet-300" aria-hidden />
          LLM API keys
        </h1>
        <p className="mt-2 text-sm text-navy-300">
          Add Cerebras and Groq keys used in priority order. When a key hits rate limits, the next
          key is tried instantly in the same request so chats stay seamless.
        </p>

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
            {error ? <p className="mt-6 text-sm text-rose-300">{error}</p> : null}

            <section className="mt-8 rounded-2xl border border-white/10 bg-navy-900/40 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
                Add key
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-navy-300">Name</span>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Cerebras prod A"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none ring-violet-500/40 focus:ring-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-navy-300">Provider</span>
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value as ApiKeyProvider)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none ring-violet-500/40 focus:ring-2"
                  >
                    <option value="cerebras">Cerebras</option>
                    <option value="groq">Groq</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-sm">
                <span className="text-navy-300">API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="Paste full key — only prefix is shown later"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-sm text-white outline-none ring-violet-500/40 focus:ring-2"
                />
              </label>
              <button
                type="button"
                disabled={saving || !newApiKey.trim()}
                onClick={() => void addKey()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add to pool
              </button>
            </section>

            <section className="mt-6 rounded-2xl border border-white/10 bg-navy-900/40 p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
                  Hierarchy ({keys.length})
                </h2>
                {saving ? <span className="text-xs text-navy-500">Saving…</span> : null}
              </div>
              <p className="mt-2 text-xs text-navy-500">
                Top of the list is tried first. Env keys (<code className="text-navy-400">CEREBRAS_API_KEY</code> /{" "}
                <code className="text-navy-400">GROQ_API_KEY</code>) are appended after these if set.
              </p>

              {keys.length === 0 ? (
                <p className="mt-6 text-sm text-navy-400">No keys yet — add Cerebras or Groq keys above.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {keys.map((key, index) => {
                    const cooldown = formatUntil(key.rateLimitedUntil);
                    const limited = key.rateLimited && !!cooldown;
                    return (
                      <li
                        key={key.id}
                        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono text-navy-500">#{index + 1}</span>
                            <input
                              value={key.name}
                              onChange={(e) => {
                                const name = e.target.value;
                                setKeys((prev) =>
                                  prev.map((k) => (k.id === key.id ? { ...k, name } : k)),
                                );
                              }}
                              onBlur={(e) => {
                                void postAction({
                                  action: "update",
                                  id: key.id,
                                  name: e.target.value,
                                });
                              }}
                              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-white outline-none hover:border-white/10 focus:border-violet-500/40"
                            />
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                key.provider === "cerebras"
                                  ? "bg-amber-500/15 text-amber-200"
                                  : "bg-sky-500/15 text-sky-200"
                              }`}
                            >
                              {key.provider}
                            </span>
                            {!key.enabled ? (
                              <span className="rounded-md bg-navy-700 px-2 py-0.5 text-[11px] text-navy-300">
                                disabled
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 font-mono text-xs text-navy-400">{key.keyPrefix}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            {limited ? (
                              <span className="rounded-md bg-rose-500/15 px-2 py-0.5 font-medium text-rose-300">
                                Rate limited · clears in {cooldown}
                              </span>
                            ) : (
                              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300">
                                Ready
                              </span>
                            )}
                            {limited ? (
                              <button
                                type="button"
                                className="text-navy-400 underline-offset-2 hover:text-navy-200 hover:underline"
                                onClick={() =>
                                  void postAction({
                                    action: "update",
                                    id: key.id,
                                    clearRateLimit: true,
                                  })
                                }
                              >
                                Clear limit
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            title="Move up (higher priority)"
                            disabled={index === 0 || saving}
                            onClick={() => void move(index, -1)}
                            className="rounded-lg border border-white/10 p-2 text-navy-300 hover:bg-white/5 disabled:opacity-30"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Move down (lower priority)"
                            disabled={index === keys.length - 1 || saving}
                            onClick={() => void move(index, 1)}
                            className="rounded-lg border border-white/10 p-2 text-navy-300 hover:bg-white/5 disabled:opacity-30"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title={key.enabled ? "Disable" : "Enable"}
                            disabled={saving}
                            onClick={() =>
                              void postAction({
                                action: "update",
                                id: key.id,
                                enabled: !key.enabled,
                              })
                            }
                            className="rounded-lg border border-white/10 px-2.5 py-2 text-xs text-navy-300 hover:bg-white/5 disabled:opacity-30"
                          >
                            {key.enabled ? "On" : "Off"}
                          </button>
                          <button
                            type="button"
                            title="Delete key"
                            disabled={saving}
                            onClick={() => {
                              if (!window.confirm(`Delete “${key.name}”?`)) return;
                              void postAction({ action: "delete", id: key.id });
                            }}
                            className="rounded-lg border border-rose-500/30 p-2 text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
