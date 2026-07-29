"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { useAccount } from "@/lib/account/context";
import { UsernameField } from "./UsernameField";
import { useUsernameCheck } from "@/lib/hooks/use-username-check";
import { FormField } from "./FormField";
import { GoogleButton } from "./GoogleButton";

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
  // When email confirmation is enabled, Supabase returns no session until verified
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const { status: usernameStatus } = useUsernameCheck(username, null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !email || !password) return;

    if (trimmedUsername.length < 3) { setError("Username must be at least 3 characters."); return; }
    if (!USERNAME_RE.test(trimmedUsername)) { setError("Username can only contain letters, numbers and underscores."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (usernameStatus === "taken") { setError("That username is already taken. Try another."); return; }
    if (usernameStatus === "checking") { setError("Please wait while we check your username."); return; }

    setLoading(true);
    setError(null);

    const redirectTo = `${typeof window !== "undefined" ? window.location.origin : "https://banterbird.app"}/auth/callback`;

    // Check if current session is anonymous — if so, upgrade it in-place
    // by calling updateUser instead of signUp. This preserves the user ID
    // so active chat rooms, friend requests, and presence all keep working.
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const isAnon = currentSession?.user
      ? ((currentSession.user as { is_anonymous?: boolean }).is_anonymous ?? false)
      : false;

    let userId: string | null = null;
    let needsEmailConfirm = false;

    if (isAnon) {
      // Upgrade anonymous → named by attaching email + password
      const { data: updateData, error: updateErr } = await supabase.auth.updateUser({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (updateErr || !updateData.user) {
        setError(updateErr?.message ?? "Sign-up failed.");
        setLoading(false);
        return;
      }
      userId = updateData.user.id;
      // email_confirmed_at will be null if Supabase sent a confirmation email
      needsEmailConfirm = !updateData.user.email_confirmed_at;
    } else {
      // Fresh sign-up (no anonymous session)
      const { data, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (authErr || !data.user) {
        setError(authErr?.message ?? "Sign-up failed.");
        setLoading(false);
        return;
      }
      userId = data.user.id;
      needsEmailConfirm = !data.session;
    }

    // Save username via server route (service role bypasses RLS race condition
    // that occurs when the session cookie isn't fully set after signUp())
    const profileRes = await fetch("/api/auth/create-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: trimmedUsername }),
    });
    const profileJson = (await profileRes.json().catch(() => ({}))) as { error?: string };

    if (!profileRes.ok) {
      setError(profileJson.error ?? "Failed to save username.");
      setLoading(false);
      return;
    }

    setLoading(false);

    // No session = email confirmation required
    if (needsEmailConfirm) {
      setAwaitingVerification(true);
      return;
    }

    // Confirmation disabled = sign in immediately
    await refresh();
    onSuccess();
  };

  // ── Awaiting verification screen ────────────────────────────
  if (awaitingVerification) {
    return (
      <div className="space-y-5 py-2 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-100 dark:bg-navy-800">
            <Mail className="h-8 w-8 text-navy-700 dark:text-navy-300" />
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold text-navy-950 dark:text-navy-50">Check your inbox</h3>
          <p className="mt-2 text-sm leading-relaxed text-navy-600 dark:text-navy-400">
            We sent a confirmation link to <strong className="text-navy-900 dark:text-navy-100">{email}</strong>.
            Click the link in the email to activate your account, then sign in.
          </p>
        </div>
        <p className="text-xs text-navy-400 dark:text-navy-500">
          Did not receive it? Check your spam folder or{" "}
          <button
            type="button"
            className="font-semibold text-navy-700 underline underline-offset-2 dark:text-navy-300"
            onClick={() => { setAwaitingVerification(false); setError(null); }}
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GoogleButton supabase={supabase} label="Sign up with Google" />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
        <span className="text-xs text-navy-500 dark:text-navy-400">or email</span>
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <UsernameField
          id="signup-username"
          value={username}
          onChange={setUsername}
          required
        />
        <FormField id="signup-email" label="Email" type="email" autoComplete="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <FormField id="signup-password" label="Password" type="password" autoComplete="new-password"
          placeholder="at least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username || !email || !password || usernameStatus === "taken" || usernameStatus === "checking"}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
        >
          {loading ? <InlineSpinner /> : "Create account"}
        </button>
      </form>
    </div>
  );
}
