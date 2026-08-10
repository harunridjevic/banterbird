"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2, Users, X, Infinity } from "lucide-react";
import { OpsLoadingPanel, PAGE_SIZE } from "@/components/ops/OpsLoadingPanel";
import { OpsBackLink } from "@/components/ops/OpsBackLink";
import type { OpsUserRow } from "@/app/api/ops/users/route";
import type { AnonCleanupResult } from "@/app/api/ops/anon-cleanup/route";

const PROVIDER_BADGE: Record<string, string> = {
  google: "bg-blue-500/20 text-blue-300",
  email: "bg-navy-500/20 text-navy-300",
  anonymous: "bg-navy-700/30 text-navy-400",
};

function ProviderBadge({ provider, isAnonymous }: { provider: string; isAnonymous: boolean }) {
  const label = isAnonymous ? "anonymous" : provider;
  const cls = PROVIDER_BADGE[label] ?? "bg-violet-500/20 text-violet-300";
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function fmt(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtShort(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function UnlimitedProToggle({ user, onToggle }: { user: OpsUserRow; onToggle: (id: string, grant: boolean) => void }) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ops/grant-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, grant: !user.is_unlimited_pro }),
      });
      if (res.ok) onToggle(user.id, !user.is_unlimited_pro);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleClick()}
      title={user.is_unlimited_pro ? "Revoke unlimited PRO" : "Grant unlimited PRO"}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        user.is_unlimited_pro
          ? "border border-amber-400/40 bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
          : "border border-white/10 bg-white/5 text-navy-500 hover:bg-white/10 hover:text-navy-200"
      }`}
    >
      <Infinity className="h-3 w-3" />
      {user.is_unlimited_pro ? "Unlimited" : "Grant"}
    </button>
  );
}

export default function OpsUsersPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [users, setUsers] = useState<OpsUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Anon cleanup state
  const [cleanupState, setCleanupState] = useState<
    "idle" | "previewing" | "confirming" | "deleting" | "done"
  >("idle");
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const load = useCallback(async (offset = 0, append = false, q = search) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      const res = await fetch(`/api/ops/users?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { users: OpsUserRow[]; total: number; hasMore: boolean };
      setUsers((prev) => (append ? [...prev, ...data.users] : data.users));
      setTotal(data.total);
      setHasMore(data.hasMore);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [search]);

  // Auth check on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ops/analytics/data?period=month&days=30");
        if (res.ok) {
          setUnlocked(true);
          void load(0, false, "");
        }
      } finally {
        setCheckingAuth(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleUnlimitedPro = useCallback((userId: string, grant: boolean) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, is_unlimited_pro: grant, is_pro: grant, pro_until: grant ? "2099-12-31 00:00:00+00" : null }
          : u,
      ),
    );
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    void load(0, false, searchInput);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
    void load(0, false, "");
  };

  // Step 1: dry-run to preview count
  const handleCleanupPreview = async () => {
    setCleanupState("previewing");
    setCleanupError(null);
    try {
      const res = await fetch("/api/ops/anon-cleanup?dry=true", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setCleanupError(j.error ?? "Preview failed");
        setCleanupState("idle");
        return;
      }
      const data = (await res.json()) as AnonCleanupResult;
      setCleanupCount(data.deleted);
      setCleanupState("confirming");
    } catch {
      setCleanupError("Network error");
      setCleanupState("idle");
    }
  };

  // Step 2: real delete after confirmation
  const handleCleanupConfirm = async () => {
    setCleanupState("deleting");
    setCleanupError(null);
    try {
      const res = await fetch("/api/ops/anon-cleanup", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setCleanupError(j.error ?? "Delete failed");
        setCleanupState("confirming");
        return;
      }
      const data = (await res.json()) as AnonCleanupResult;
      setCleanupCount(data.deleted);
      setCleanupState("done");
    } catch {
      setCleanupError("Network error");
      setCleanupState("confirming");
    }
  };

  const resetCleanup = () => {
    setCleanupState("idle");
    setCleanupCount(null);
    setCleanupError(null);
  };

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#0c121c]"><OpsLoadingPanel label="Checking ops access…" /></div>;
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
        <div className="mx-auto max-w-5xl">
          <OpsBackLink />
          <p className="mt-4 text-sm text-navy-400">
            Unlock ops first from the{" "}
            <a href="/ops" className="underline hover:text-navy-200">ops dashboard</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-5xl">
        <OpsBackLink />

        {/* Header row */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Users className="h-7 w-7 text-violet-400" />
            <h1 className="text-2xl font-bold text-white">Users</h1>
          </div>

          {/* Anon cleanup button cluster */}
          <div className="flex items-center gap-2">
            {cleanupState === "idle" && (
              <button
                type="button"
                onClick={() => void handleCleanupPreview()}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete stale anon users
              </button>
            )}

            {cleanupState === "previewing" && (
              <span className="text-xs text-navy-400 animate-pulse">Counting…</span>
            )}

            {cleanupState === "confirming" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-navy-300">
                  {cleanupCount === 0
                    ? "No stale anon users found."
                    : `Delete ${cleanupCount?.toLocaleString()} stale anon user${cleanupCount === 1 ? "" : "s"}?`}
                </span>
                {cleanupCount !== null && cleanupCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleCleanupConfirm()}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 transition-colors"
                  >
                    Confirm
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetCleanup}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-navy-400 hover:text-navy-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {cleanupState === "deleting" && (
              <span className="text-xs text-rose-300 animate-pulse">Deleting…</span>
            )}

            {cleanupState === "done" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400">
                  ✓ Deleted {cleanupCount?.toLocaleString()} anon user{cleanupCount === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={resetCleanup}
                  className="text-xs text-navy-500 hover:text-navy-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {cleanupError && (
              <span className="text-xs text-rose-400">{cleanupError}</span>
            )}
          </div>
        </div>

        <p className="mt-1 text-sm text-navy-400">
          Registered accounts only · {total.toLocaleString()} shown
        </p>

        {/* Stats chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-xl border border-white/10 bg-navy-900/40 px-3 py-1.5 text-xs text-navy-300">
            {total.toLocaleString()} registered accounts
          </span>
          <span className="rounded-xl border border-white/10 bg-navy-900/40 px-3 py-1.5 text-xs text-navy-300">
            {users.filter((u) => u.provider === "google").length} via Google (this page)
          </span>
          <span className="rounded-xl border border-white/10 bg-navy-900/40 px-3 py-1.5 text-xs text-navy-300">
            {users.filter((u) => u.provider === "email").length} via email (this page)
          </span>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by username, email or user ID…"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-9 text-sm text-white outline-none placeholder:text-navy-500 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-500 hover:text-navy-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-navy-200 hover:bg-white/5 disabled:opacity-50"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => void load(0, false, search)}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-navy-200 hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
        </form>

        {/* Table — desktop */}
        <div className="mt-5 hidden overflow-hidden rounded-2xl border border-white/10 sm:block">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_110px_90px_90px_110px_150px] gap-4 border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
            <span>User</span>
            <span>Email</span>
            <span>Provider</span>
            <span>Plan</span>
            <span>Joined</span>
            <span>Unlimited</span>
            <span>Last sign in</span>
          </div>

          {loading ? (
            <OpsLoadingPanel label="Loading users…" compact />
          ) : users.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-navy-500">No users found.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="grid grid-cols-[1fr_1fr_110px_90px_90px_110px_150px] items-center gap-4 px-4 py-3 text-sm hover:bg-white/[0.03]"
                >
                  {/* User */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-xs font-bold text-navy-300">
                        {u.username?.[0]?.toUpperCase() ?? u.email?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">
                        {u.username ?? <span className="italic text-navy-500">no username</span>}
                      </p>
                      <p className="truncate font-mono text-[11px] text-navy-500">{u.id.slice(0, 8)}…</p>
                    </div>
                  </div>

                  {/* Email */}
                  <span className="truncate text-navy-300">
                    {u.email ?? <span className="italic text-navy-600">n/a</span>}
                  </span>

                  {/* Provider */}
                  <ProviderBadge provider={u.provider} isAnonymous={u.is_anonymous} />

                  {/* Plan */}
                  {u.is_pro ? (
                    <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                      PRO
                    </span>
                  ) : (
                    <span className="text-xs text-navy-500">Free</span>
                  )}

                  {/* Joined */}
                  <span className="whitespace-nowrap text-xs text-navy-400">
                    {fmtShort(u.created_at)}
                  </span>

                  {/* Unlimited PRO toggle */}
                  <UnlimitedProToggle user={u} onToggle={handleToggleUnlimitedPro} />

                  {/* Last sign in */}
                  <span className="whitespace-nowrap text-xs text-navy-400">
                    {fmt(u.last_sign_in_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Card list — mobile */}
        <div className="mt-5 sm:hidden">
          {loading ? (
            <OpsLoadingPanel label="Loading users…" compact />
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-navy-500">No users found.</p>
          ) : (
            <ul className="space-y-2">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="rounded-2xl border border-white/10 bg-navy-900/30 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-sm font-bold text-navy-300">
                        {u.username?.[0]?.toUpperCase() ?? u.email?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-white">
                          {u.username ?? <span className="italic text-navy-500">no username</span>}
                        </p>
                        <ProviderBadge provider={u.provider} isAnonymous={u.is_anonymous} />
                      </div>
                      <p className="truncate text-xs text-navy-400">{u.email ?? "n/a"}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-navy-500">
                    <span>Joined {fmtShort(u.created_at)}</span>
                    <span>Last seen {fmtShort(u.last_sign_in_at)}</span>
                    <span className="font-mono">{u.id.slice(0, 8)}…</span>
                    {u.is_pro && (
                      <span className="font-semibold text-amber-400">PRO</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <UnlimitedProToggle user={u} onToggle={handleToggleUnlimitedPro} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load(users.length, true)}
              className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-navy-100 hover:bg-white/10 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : `Load more (${users.length} of ${total})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
