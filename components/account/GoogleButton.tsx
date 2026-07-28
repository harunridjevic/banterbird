"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";

export function GoogleButton({
  supabase,
  label = "Continue with Google",
}: {
  supabase: SupabaseClient;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : "/auth/callback";

    if (typeof window !== "undefined") {
      // Store return path
      const currentPath = window.location.pathname;
      if (currentPath !== "/" && !currentPath.startsWith("/auth")) {
        sessionStorage.setItem("banterbird:auth_return_to", currentPath);
      }
      // Prevent ChatRoom from ending the room on page unload
      sessionStorage.setItem("banterbird:oauth_redirect", "1");
    }

    // Check for anonymous session
    const { data: { session } } = await supabase.auth.getSession();
    const anonId = session?.user?.id ?? null;
    const isAnon = session?.user
      ? ((session.user as { is_anonymous?: boolean }).is_anonymous ?? false)
      : false;

    if (isAnon && anonId) {
      // Store the anonymous user ID so the callback can migrate rooms
      // and friend requests to the new named account
      sessionStorage.setItem("banterbird:anon_user_id", anonId);

      // Sign out the anonymous session cleanly before Google OAuth.
      // This avoids the "identity already linked" error entirely — we're
      // not trying to link, just signing into the named account.
      await supabase.auth.signOut({ scope: "local" });
    }

    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (oauthErr) {
      setError(oauthErr.message);
      sessionStorage.removeItem("banterbird:oauth_redirect");
      sessionStorage.removeItem("banterbird:anon_user_id");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-navy-200/80 bg-white px-4 py-3 text-sm font-semibold text-navy-900 shadow-sm transition hover:bg-navy-50 disabled:opacity-60 dark:border-white/10 dark:bg-navy-800 dark:text-navy-100 dark:hover:bg-navy-700"
      >
        {loading ? (
          <InlineSpinner />
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
          </svg>
        )}
        {label}
      </button>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
