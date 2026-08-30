"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { UserCircle } from "lucide-react";
import { useAccount } from "@/lib/account/context";

/**
 * A tooltip that appears when an anonymous user tries to use a feature
 * that requires an account. Uses a portal so it's never clipped by any
 * parent with overflow:hidden. Positions itself relative to the trigger
 * element on screen with viewport edge clamping and smooth animation.
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
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    below: boolean;
    arrowLeft: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const computePos = useCallback(() => {
    if (!triggerRef?.current) {
      setPos({ top: 0, left: 0, below: false, arrowLeft: 115 });
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const nudgeW = 230; // tooltip width
    const nudgeH = 125; // estimated tooltip height
    const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
    const padding = 12;

    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const below = preferBelow || (spaceAbove < nudgeH + 16 && spaceBelow >= nudgeH + 16);

    const top = below ? rect.bottom + 8 : rect.top - nudgeH - 8;

    const btnCenterX = rect.left + rect.width / 2;
    const halfW = nudgeW / 2;
    // Clamp tooltip horizontal center so it remains fully visible within viewport
    const clampedCenterX = Math.max(halfW + padding, Math.min(vw - halfW - padding, btnCenterX));

    // Calculate where arrow should sit along the tooltip's width
    const boxLeft = clampedCenterX - halfW;
    const arrowPx = Math.max(16, Math.min(nudgeW - 16, btnCenterX - boxLeft));

    setPos({
      top,
      left: clampedCenterX,
      below,
      arrowLeft: arrowPx,
    });
  }, [triggerRef, preferBelow]);

  // Measure position synchronously before paint
  useLayoutEffect(() => {
    if (!visible) return;
    computePos();
  }, [visible, computePos]);

  // Keep positioned during scroll or resize while visible
  useEffect(() => {
    if (!visible) return;
    const handleReposition = () => computePos();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [visible, computePos]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (
        nudgeRef.current &&
        !nudgeRef.current.contains(e.target as Node) &&
        (!triggerRef?.current || !triggerRef.current.contains(e.target as Node))
      ) {
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onDismiss, triggerRef]);

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {visible && pos && (
        <motion.div
          ref={nudgeRef}
          initial={{ opacity: 0, scale: 0.9, y: pos.below ? -8 : 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: pos.below ? -8 : 8 }}
          transition={{ type: "spring", damping: 26, stiffness: 400 }}
          style={{
            position: "fixed",
            top: triggerRef ? pos.top : undefined,
            left: triggerRef ? pos.left : undefined,
            transform: triggerRef ? "translateX(-50%)" : undefined,
            zIndex: 9999,
          }}
          className={`w-[230px] rounded-2xl border border-navy-200/80 bg-white/95 p-3.5 text-center shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-navy-900/95 ${
            !triggerRef ? "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : ""
          }`}
        >
          <p className="mb-2.5 text-xs font-medium text-navy-700 dark:text-navy-300">{message}</p>
          <button
            type="button"
            onClick={() => {
              onDismiss();
              openModal();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-navy-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-navy-800 active:scale-[0.98] dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
          >
            <UserCircle className="h-3.5 w-3.5" />
            Sign in / Create account
          </button>
          {/* Arrow pointing toward trigger */}
          {triggerRef && (
            <div
              style={{ left: pos.arrowLeft }}
              className={`absolute h-3 w-3 -translate-x-1/2 rotate-45 border border-navy-200/80 bg-white dark:border-white/10 dark:bg-navy-900 ${
                pos.below
                  ? "-top-1.5 border-b-0 border-r-0"
                  : "-bottom-1.5 border-t-0 border-l-0"
              }`}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
