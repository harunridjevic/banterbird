"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type AuthError = {
  title: string;
  message: string;
  /** When true, automatically trigger a normal Google sign-in after a short delay */
  autoSignIn?: boolean;
};

function parseAuthError(params: URLSearchParams): AuthError | null {
  const error = params.get("error");
  const code = params.get("error_code");
  const description = params.get("error_description")?.replace(/\+/g, " ");

  if (!error) return null;

  if (code === "otp_expired" || description?.toLowerCase().includes("expired")) {
    return {
      title: "Link expired",
      message: "This link has expired. Please request a new one and try again.",
    };
  }

  if (
    error === "access_denied" && (
      description?.toLowerCase().includes("already linked") ||
      description?.toLowerCase().includes("identity is already")
    )
  ) {
    return {
      title: "Signing you in…",
      message: "This Google account is linked to an existing BanterBird account. Signing you in now.",
      autoSignIn: true,
    };
  }

  if (error === "access_denied") {
    return {
      title: "Access denied",
      message: description ?? "This link is invalid or has already been used. Please try again.",
    };
  }

  if (code === "email_not_confirmed") {
    return {
      title: "Email not verified",
      message: "Please verify your email address before signing in.",
    };
  }

  if (description) {
    return { title: "Something went wrong", message: description };
  }

  return { title: "Something went wrong", message: "An unexpected error occurred. Please try again." };
}

export function AuthErrorHandler() {
  const [authError, setAuthError] = useState<AuthError | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const parsed = parseAuthError(params);

    if (!parsed) return;

    // Clean URL immediately
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (parsed.autoSignIn) {
      // The "already linked" error means their Google account belongs to an
      // existing named user. Sign out the anonymous session and do a normal
      // Google sign-in so they land in their existing account.
      const supabase = createClient();
      void supabase.auth.signOut({ scope: "local" }).then(() => {
        const redirectTo = `${window.location.origin}/auth/callback`;
        void supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
      });
      // Show a brief message while redirecting
      setAuthError(parsed);
    } else {
      setAuthError(parsed);
    }
  }, []);

  return (
    <AnimatePresence>
      {authError && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed left-1/2 top-4 z-[9999] w-full max-w-sm -translate-x-1/2 px-4"
          role="alert"
          aria-live="assertive"
        >
          <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-xl ${
            authError.autoSignIn
              ? "border-blue-200 bg-white dark:border-blue-900/50 dark:bg-navy-900"
              : "border-rose-200 bg-white dark:border-rose-900/50 dark:bg-navy-900"
          }`}>
            <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${
              authError.autoSignIn ? "text-blue-500" : "text-rose-500"
            }`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${
                authError.autoSignIn
                  ? "text-blue-700 dark:text-blue-400"
                  : "text-rose-700 dark:text-rose-400"
              }`}>
                {authError.title}
              </p>
              <p className={`mt-0.5 text-sm ${
                authError.autoSignIn
                  ? "text-blue-600/80 dark:text-blue-400/80"
                  : "text-rose-600/80 dark:text-rose-400/80"
              }`}>
                {authError.message}
              </p>
            </div>
            {!authError.autoSignIn && (
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
