"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { InlineSpinner } from "@/components/ui/Loading";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  const supabase = createClient();

  // Supabase embeds the recovery token in the URL hash.
  // Calling getSession() after page load will exchange it automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    setError(null);

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) { setError(updateErr.message); return; }
    setDone(true);
    setTimeout(() => router.replace("/"), 2500);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--page-bg)] px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-navy-200/70 bg-white/70 shadow-lg dark:border-white/10 dark:bg-navy-900/50">
            <LogoMark className="h-9 w-9" />
          </div>
        </div>

        <div className="glass-panel rounded-3xl border border-navy-200/70 p-7 shadow-xl dark:border-white/10">
          {done ? (
            <div className="py-4 text-center">
              <p className="text-base font-bold text-navy-950 dark:text-navy-50">Password updated</p>
              <p className="mt-2 text-sm text-navy-600 dark:text-navy-400">Redirecting you home…</p>
            </div>
          ) : !ready ? (
            <div className="py-6 text-center">
              <InlineSpinner className="mx-auto h-6 w-6" />
              <p className="mt-4 text-sm text-navy-600 dark:text-navy-400">Verifying your reset link…</p>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-lg font-bold text-navy-950 dark:text-navy-50">Choose a new password</h1>
              <p className="mb-5 text-sm text-navy-600 dark:text-navy-400">Must be at least 8 characters.</p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="np" className="block text-xs font-semibold text-navy-700 dark:text-navy-300">New password</label>
                  <input
                    id="np" type="password" autoComplete="new-password" required
                    placeholder="at least 8 characters"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-navy-200/80 bg-white/80 px-3 py-2.5 text-sm text-navy-950 placeholder:text-navy-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-400/20 dark:border-white/10 dark:bg-navy-900/60 dark:text-navy-50 dark:placeholder:text-navy-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="cp" className="block text-xs font-semibold text-navy-700 dark:text-navy-300">Confirm password</label>
                  <input
                    id="cp" type="password" autoComplete="new-password" required
                    placeholder="repeat password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-xl border border-navy-200/80 bg-white/80 px-3 py-2.5 text-sm text-navy-950 placeholder:text-navy-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-400/20 dark:border-white/10 dark:bg-navy-900/60 dark:text-navy-50 dark:placeholder:text-navy-500"
                  />
                </div>

                {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
                >
                  {loading ? <InlineSpinner /> : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
