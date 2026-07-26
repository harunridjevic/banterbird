"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { FormField } from "./FormField";
import { GoogleButton } from "./GoogleButton";
import { useAccount } from "@/lib/account/context";

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

export function SignUpForm({
  supabase,
  onSuccess,
}: {
  supabase: SupabaseClient;
  onSuccess: () => void;
}) {
  const { refresh } = useAccount();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !email || !password) return;

    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!USERNAME_RE.test(trimmedUsername)) {
      setError("Username can only contain letters, numbers and underscores.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr || !data.user) {
      setError(authErr?.message ?? "Sign-up failed.");
      setLoading(false);
      return;
    }

    // Write username to profile — must happen before refresh() so the
    // account context picks it up correctly.
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: data.user.id, username: trimmedUsername }, { onConflict: "id" });

    if (profileErr) {
      setError(
        profileErr.message.toLowerCase().includes("unique")
          ? "That username is already taken. Try another."
          : profileErr.message,
      );
      setLoading(false);
      return;
    }

    // Explicitly refresh the account context now that the profile row is ready.
    // This overrides any earlier onAuthStateChange refresh that ran before the upsert.
    await refresh();

    setLoading(false);
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <GoogleButton supabase={supabase} label="Sign up with Google" />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
        <span className="text-xs text-navy-500 dark:text-navy-400">or email</span>
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField
          id="signup-username"
          label="Username"
          type="text"
          autoComplete="username"
          placeholder="coolbird42"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <FormField
          id="signup-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="signup-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="at least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username || !email || !password}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
        >
          {loading ? <InlineSpinner /> : "Create account"}
        </button>
      </form>
    </div>
  );
}
