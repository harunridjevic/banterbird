"use client";

import Link from "next/link";
import { BarChart3, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/app/providers";

const cards = [
  {
    href: "/ops/banterbird-stats",
    title: "Analytics",
    description: "Users, chats, room times, API usage, and live online count.",
    icon: BarChart3,
  },
  {
    href: "/ops/settings",
    title: "Bot settings",
    description: "Tune AI practice bot timing, personality, sexual vibe, and session policy. Changes apply live.",
    icon: Settings,
  },
] as const;

export default function OpsDashboardPage() {
  const { client, ready } = useSupabase();
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCookie, setIsCheckingCookie] = useState(true);

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
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    setIsCheckingCookie(true);
    // Check if cookie exists and is valid by making a test request
    void (async () => {
      try {
        const res = await fetch("/api/ops/analytics/data?period=month&days=30", { method: "GET" });
        if (res.ok) {
          setUnlocked(true);
        }
      } catch {
        // Cookie not valid or network error - stay locked
      } finally {
        setIsCheckingCookie(false);
      }
    })();
  }, []);

  // Send heartbeat to count dashboard viewers as online
  useEffect(() => {
    if (!ready) return;
    const sendHeartbeat = async () => {
      const { error } = await client.rpc("heartbeat_presence");
      if (error) console.error("Heartbeat error in dashboard:", error);
    };
    void sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60_000);
    return () => clearInterval(interval);
  }, [client, ready]);
  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">Ops</h1>
        <p className="mt-2 text-sm text-navy-300">
          Internal tools for BanterBird. Not linked from the main app.
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
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {cards.map(({ href, title, description, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group rounded-2xl border border-white/10 bg-navy-900/40 p-6 transition hover:border-violet-500/40 hover:bg-navy-900/60"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-violet-600/20 p-3 text-violet-300 group-hover:bg-violet-600/30">
                      <Icon className="h-6 w-6" aria-hidden />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">{title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-navy-300">{description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <p className="mt-10 text-xs text-navy-500">
          <Link href="/" className="text-navy-400 underline-offset-2 hover:text-navy-200 hover:underline">
            Back to app
          </Link>
        </p>
      </div>
    </div>
  );
}
