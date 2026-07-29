"use client";

import { useEffect, useRef } from "react";
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
  onNotifSync,
}: {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  supabase: SupabaseClient;
  notifCount?: number;
  onNotifClear?: () => void;
  onNotifSync?: (count: number) => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // When the drawer closes, blur any focused input inside it so the mobile
  // keyboard dismisses before the slide-out animation runs. Without this,
  // the virtual keyboard stays up during the transition and some browsers
  // (Android Chrome, iOS Safari) leave the main layout at the reduced
  // keyboard-height, pushing the footer up until the next repaint.
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && drawerRef.current?.contains(active)) {
        active.blur();
      }
    }
  }, [open]);

  // The panel is ALWAYS mounted so unread state survives open/close cycles.
  // We use CSS translate + visibility to show/hide rather than conditional render.
  return (
    <aside
      ref={drawerRef}
      aria-label="Friends &amp; Messages"
      aria-hidden={!open}
      className={[
        "fixed inset-y-0 right-0 z-[200] flex h-dvh w-full flex-col",
        "border-l border-navy-200 bg-[var(--page-bg)] shadow-2xl",
        "dark:border-white/10 dark:bg-navy-950",
        "sm:max-w-sm",
        // Slide transition via CSS — no unmounting
        "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        open ? "translate-x-0" : "translate-x-full pointer-events-none",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-navy-200 px-4 py-4 dark:border-white/10">
        <Users className="h-5 w-5 shrink-0 text-navy-600 dark:text-navy-400" />
        <h2 className="flex-1 text-base font-bold text-navy-950 dark:text-navy-50">
          Friends &amp; Messages
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-navy-200/70 bg-white/70 text-navy-600 transition active:scale-95 hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — always mounted, state preserved */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <FriendsPanel
          currentUserId={currentUserId}
          supabase={supabase}
          onClose={onClose}
          onNotifClear={onNotifClear}
          onNotifSync={onNotifSync}
        />
      </div>
    </aside>
  );
}
