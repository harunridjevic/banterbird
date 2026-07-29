"use client";

import { useState, useRef } from "react";
import { Mail, AlertCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { FormField } from "./FormField";
import { GoogleButton } from "./GoogleButton";

function looksLikeEmail(value: string) {
  return value.includes("@");
}

type View = "signin" | "forgot" | "forgot_sent";

export function SignInForm({
  supabase,
  onSuccess,
}: {
  supabase: SupabaseClient;
  onSuccess: () => void;
}) {
  const [view, setView] = useState<View>("signin");

  // Sign-in state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // ── Sign in ──────────────────────────────────────────────────

  // Cache the resolved email so a failed password attempt doesn't require
  // another resolve-username call (Supabase clears the anon session on a
  // failed signInWithPassword, which would make the next resolve fail).
  const resolvedEmailRef = useRef<{ username: string; email: string } | null>(null);

  const resolveEmail = async (username: string): Promise<{ email: string } | { error: string }> => {
    // Return cached result if the username hasn't changed
    if (resolvedEmailRef.current?.username === username.toLowerCase()) {
      return { email: resolvedEmailRef.current.email };
    }

    const res = await fetch("/api/auth/resolve-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const json = (await res.json().catch(() => ({}))) as { email?: string; error?: string; code?: string };
    if (!res.ok || !json.email) {
      return { error: json.error ?? "Couldn't find that account. Check your username and try again." };
    }

    // Cache it for retries with the same username
    resolvedEmailRef.current = { username: username.toLowerCase(), email: json.email };
    return { email: json.email };
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || !password) return;
    setLoading(true);
    setError(null);

    let email = id;
    if (!looksLikeEmail(id)) {
      const result = await resolveEmail(id);
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      email = result.email;
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authErr) {
      // Map Supabase auth errors to friendly messages
      const msg = authErr.message.toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("wrong password")) {
        setError("That password doesn't match. Double-check it and try again.");
      } else if (msg.includes("email not confirmed")) {
        setError("Please verify your email before signing in. Check your inbox.");
      } else if (msg.includes("too many requests") || msg.includes("rate limit")) {
        setError("Too many attempts. Wait a moment and try again.");
      } else {
        setError("Couldn't sign in. Check your details and try again.");
      }
      return;
    }
    onSuccess();
  };

  // ── Forgot password ──────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailVal = resetEmail.trim();
    if (!emailVal) return;
    setResetLoading(true);
    setResetError(null);

    const redirectTo = `${typeof window !== "undefined" ? window.location.origin : "https://banterbird.app"}/account/reset-password`;

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailVal, { redirectTo });
    setResetLoading(false);

    if (resetErr) {
      setResetError(resetErr.message);
      return;
    }
    setView("forgot_sent");
  };

  // ── Forgot sent screen ───────────────────────────────────────
  if (view === "forgot_sent") {
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
            If an account exists for <strong className="text-navy-900 dark:text-navy-100">{resetEmail}</strong>,
            we sent a password reset link. Check your spam folder if it does not arrive.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setView("signin"); setResetEmail(""); setResetError(null); }}
          className="text-sm font-semibold text-navy-700 underline underline-offset-2 dark:text-navy-300"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Forgot password form ─────────────────────────────────────
  if (view === "forgot") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-navy-950 dark:text-navy-50">Reset your password</h3>
          <p className="mt-1 text-sm text-navy-600 dark:text-navy-400">
            Enter your email and we will send you a reset link.
          </p>
        </div>
        <form onSubmit={handleForgotPassword} className="space-y-3">
          <FormField
            id="reset-email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            required
          />
          {resetError && <p className="text-xs text-rose-600 dark:text-rose-400">{resetError}</p>}
          <button
            type="submit"
            disabled={resetLoading || !resetEmail.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
          >
            {resetLoading ? <InlineSpinner /> : "Send reset link"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setView("signin"); setResetError(null); }}
          className="w-full text-center text-sm text-navy-500 hover:text-navy-800 dark:text-navy-400 dark:hover:text-navy-200"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Sign in form ─────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <GoogleButton supabase={supabase} label="Sign in with Google" />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
        <span className="text-xs text-navy-500 dark:text-navy-400">or credentials</span>
        <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
      </div>

      <form onSubmit={handleSignIn} className="space-y-3">
        <FormField
          id="signin-identifier" label="Username or email" type="text" autoComplete="username"
          placeholder="coolbird42 or you@example.com" value={identifier}
          onChange={(e) => { setIdentifier(e.target.value); resolvedEmailRef.current = null; }} required
        />
        <div className="space-y-1.5">
          <FormField
            id="signin-password" label="Password" type="password" autoComplete="current-password"
            placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)} required
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setView("forgot"); setResetEmail(looksLikeEmail(identifier) ? identifier : ""); }}
              className="text-xs text-navy-500 underline-offset-2 hover:text-navy-800 hover:underline dark:text-navy-400 dark:hover:text-navy-200"
            >
              Forgot password?
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-500/20 dark:bg-rose-500/8">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>
          </div>
        )}

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
