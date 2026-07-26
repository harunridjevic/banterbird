"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { FormField } from "./FormField";
import { GoogleButton } from "./GoogleButton";

export function SignInForm({
  supabase,
  onSuccess,
}: {
  supabase: SupabaseClient;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authErr) {
      setError(authErr.message);
      return;
    }
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <GoogleButton supabase={supabase} label="Sign in with Google" />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
        <span className="text-xs text-navy-500 dark:text-navy-400">or email</span>
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField
          id="signin-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="signin-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
        >
          {loading ? <InlineSpinner /> : "Sign in"}
        </button>
      </form>
    </div>
  );
}
