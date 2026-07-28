"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserCircle } from "lucide-react";
import { useAccount } from "@/lib/account/context";

/**
 * A tooltip that appears when an anonymous user tries to use a feature
 * that requires an account. Uses a portal so it's never clipped by any
 * parent with overflow:hidden. Positions itself relative to the trigger
 * element on screen.
 */
export function AccountNudge({
  visible,
  onDismiss,
  message = "Sign in or create a free account to use this feature.",
  triggerRef,
  preferBelow = false,
}: {
  visible: boolean;
  onDismiss: () => void;
  message?: string;
  /** Ref to the button that triggered the nudge — used to position the tooltip */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** When true, show below the trigger instead of above */
  preferBelow?: boolean;
}) {
  const { openModal } = useAccount();
  const nudgeRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, below: false });

  useEffect(() => { setMounted(true); }, []);

  // Position relative to trigger element
  useEffect(() => {
    if (!visible || !triggerRef?.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const nudgeH = 130;
    const spaceAbove = rect.top;
    const below = preferBelow || spaceAbove < nudgeH + 20;
    setPos({
      top: below ? rect.bottom + 8 : rect.top - nudgeH - 8,
      left: rect.left + rect.width / 2,
      below,
    });
  }, [visible, triggerRef, preferBelow]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (nudgeRef.current && !nudgeRef.current.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onDismiss]);

  if (!visible || !mounted) return null;

  const content = (
    <div
      ref={nudgeRef}
      style={{
        position: "fixed",
        top: triggerRef ? pos.top : undefined,
        left: triggerRef ? pos.left : undefined,
        transform: triggerRef ? "translateX(-50%)" : undefined,
        zIndex: 9999,
      }}
      className={`w-56 rounded-2xl border border-navy-200/70 bg-white p-3 text-center shadow-2xl dark:border-white/10 dark:bg-navy-900 ${
        !triggerRef ? "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : ""
      }`}
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
      {/* Arrow pointing toward trigger */}
      {triggerRef && (
        <div
          className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border border-navy-200/70 bg-white dark:border-white/10 dark:bg-navy-900 ${
            pos.below
              ? "-top-1.5 border-b-0 border-r-0"
              : "-bottom-1.5 border-t-0 border-l-0"
          }`}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
