"use client";

import { useEffect, useRef } from "react";
import { UserCircle } from "lucide-react";
import { useAccount } from "@/lib/account/context";

/**
 * A small tooltip that appears when an anonymous user tries to use a
 * feature that requires an account. Clicking it opens the account modal.
 */
export function AccountNudge({
  visible,
  onDismiss,
  message = "Sign in or create a free account to use this feature.",
}: {
  visible: boolean;
  onDismiss: () => void;
  message?: string;
}) {
  const { openModal } = useAccount();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-2xl border border-navy-200/70 bg-white p-3 text-center shadow-xl dark:border-white/10 dark:bg-navy-900"
    >
      <p className="mb-2 text-xs text-navy-600 dark:text-navy-400">{message}</p>
      <button
        type="button"
        onClick={() => { onDismiss(); openModal(); }}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-navy-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-navy-800 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
      >
        <UserCircle className="h-3.5 w-3.5" />
        Sign in / Create account
      </button>
      {/* Arrow */}
      <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-navy-200/70 bg-white dark:border-white/10 dark:bg-navy-900" />
    </div>
  );
}
