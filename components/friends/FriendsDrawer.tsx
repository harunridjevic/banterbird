"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Users, X } from "lucide-react";
import { FriendsPanel } from "./FriendsPanel";
import type { SupabaseClient } from "@supabase/supabase-js";

export function FriendsDrawer({
  open,
  onClose,
  currentUserId,
  supabase,
  notifCount,
  onNotifClear,
}: {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  supabase: SupabaseClient;
  notifCount?: number;
  onNotifClear?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop - plain dark overlay, no blur ── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[199] bg-navy-950/40 dark:bg-navy-950/55"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* ── Sidebar panel - full-screen on mobile, slides in from right on desktop ── */}
          <motion.aside
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 38 }}
            className="fixed inset-y-0 right-0 z-[200] flex h-screen w-full flex-col border-l border-navy-200 bg-[var(--page-bg)] shadow-2xl dark:border-white/10 dark:bg-navy-950 sm:max-w-sm"
            aria-label="Friends &amp; Messages"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-navy-200 px-4 py-4 dark:border-white/10">
              <Users className="h-5 w-5 shrink-0 text-navy-600 dark:text-navy-400" />
              <h2 className="flex-1 text-base font-bold text-navy-950 dark:text-navy-50">
                Friends &amp; Messages
              </h2>
              {notifCount && notifCount > 0 ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-navy-200/70 bg-white/70 text-navy-600 transition active:scale-95 hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <FriendsPanel
                currentUserId={currentUserId}
                supabase={supabase}
                onClose={onClose}
                onNotifClear={onNotifClear}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
