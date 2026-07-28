"use client";

import { useAccount } from "@/lib/account/context";

/**
 * A small "Have an account? Sign in" prompt shown below the match lobby
 * only when the user is anonymous. Disappears once signed in.
 */
export function SignInNudge() {
  const { state, openModal } = useAccount();

  // Only show for anonymous / loading-resolved-to-anonymous users
  if (state.status !== "anonymous") return null;

  return (
    <p className="mt-3 text-center text-xs text-navy-500 dark:text-navy-400">
      Have an account?{" "}
      <button
        type="button"
        onClick={openModal}
        className="font-semibold text-navy-800 underline underline-offset-2 transition hover:text-navy-950 dark:text-navy-200 dark:hover:text-white"
      >
        Sign in
      </button>
    </p>
  );
}
