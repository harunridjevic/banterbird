"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { FormField } from "./FormField";
import { GoogleButton } from "./GoogleButton";

/** Returns true if the string looks like an email address */
function looksLikeEmail(value: string) {
  return value.includes("@");
}

export function SignInForm({
  supabase,
  onSuccess,
}: {
  supabase: SupabaseClient;
  onSuccess: () => void;
}) {
  const [identifier, setIdentifier] = useState(""); // username or email
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || !password) return;

    setLoading(true);
    setError(null);

    let email = id;

    // If it's not an email, resolve the username to an email first
    if (!looksLikeEmail(id)) {
      const res = await fetch("/api/auth/resolve-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: id }),
      });
      const json = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
      if (!res.ok || !json.email) {
        setError(json.error ?? "Invalid username or password.");
        setLoading(false);
        return;
      }
      email = json.email;
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authErr) {
      // Don't leak whether it was the username or password that was wrong
      setError("Invalid username or password.");
      return;
    }
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <GoogleButton supabase={supabase} label="Sign in with Google" />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
        <span className="text-xs text-navy-500 dark:text-navy-400">or credentials</span>
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField
          id="signin-identifier"
          label="Username or email"
          type="text"
          autoComplete="username"
          placeholder="coolbird42 or you@example.com"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
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
          disabled={loading || !identifier || !password}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
        >
          {loading ? <InlineSpinner /> : "Sign in"}
        </button>
      </form>
    </div>
  );
}
