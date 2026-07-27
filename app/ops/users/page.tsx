"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Users, X } from "lucide-react";
import { OpsLoadingPanel, PAGE_SIZE } from "@/components/ops/OpsLoadingPanel";
import { OpsBackLink } from "@/components/ops/OpsBackLink";
import type { OpsUserRow } from "@/app/api/ops/users/route";

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
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#0c121c]"><OpsLoadingPanel label="Checking ops access…" /></div>;
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
        <div className="mx-auto max-w-5xl">
          <OpsBackLink />
          <p className="mt-4 text-sm text-navy-400">Unlock ops first from the <a href="/ops" className="underline hover:text-navy-200">ops dashboard</a>.</p>
        </div>
      </div>
    );
  }

  const namedCount = users.filter((u) => !u.is_anonymous && u.username).length;
  const anonCount = users.filter((u) => u.is_anonymous).length;

  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-5xl">
        <OpsBackLink />

        <div className="mt-4 flex items-center gap-3">
          <Users className="h-7 w-7 text-violet-400" />
          <h1 className="text-2xl font-bold text-white">Users</h1>
        </div>
        <p className="mt-1 text-sm text-navy-400">
          All registered and anonymous users · {total.toLocaleString()} total
        </p>

        {/* Summary pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-xl border border-white/10 bg-navy-900/40 px-3 py-1.5 text-xs text-navy-300">
            {total.toLocaleString()} total
          </span>
          <span className="rounded-xl border border-white/10 bg-navy-900/40 px-3 py-1.5 text-xs text-navy-300">
            {namedCount} named (this page)
          </span>
          <span className="rounded-xl border border-white/10 bg-navy-900/40 px-3 py-1.5 text-xs text-navy-300">
            {anonCount} anonymous (this page)
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
              <button type="button" onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-500 hover:text-navy-200">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button type="submit" disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-navy-200 hover:bg-white/5 disabled:opacity-50">
            Search
          </button>
          <button type="button" onClick={() => void load(0, false, search)} disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-navy-200 hover:bg-white/5 disabled:opacity-50">
            Refresh
          </button>
        </form>

        {/* Table */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_120px_100px_160px] gap-4 border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
            <span>User</span>
            <span>Email</span>
            <span>Provider</span>
            <span>Joined</span>
            <span>Last sign in</span>
          </div>

          {loading ? (
            <OpsLoadingPanel label="Loading users…" compact />
          ) : users.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-navy-500">No users found.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {users.map((u) => (
                <li key={u.id} className="grid grid-cols-[1fr_1fr_120px_100px_160px] items-center gap-4 px-4 py-3 text-sm hover:bg-white/3">
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
                      <p className="truncate text-[11px] text-navy-500 font-mono">{u.id.slice(0, 8)}…</p>
                    </div>
                  </div>

                  {/* Email */}
                  <span className="truncate text-navy-300">{u.email ?? <span className="italic text-navy-600">—</span>}</span>

                  {/* Provider */}
                  <ProviderBadge provider={u.provider} isAnonymous={u.is_anonymous} />

                  {/* Joined */}
                  <span className="text-xs text-navy-400 whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>

                  {/* Last sign in */}
                  <span className="text-xs text-navy-400 whitespace-nowrap">{fmt(u.last_sign_in_at)}</span>
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
