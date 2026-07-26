"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, UserCircle, Users } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Logo } from "@/components/brand/Logo";
import { OnlineCountPill } from "@/components/presence/OnlineCountPill";
import { useAccount } from "@/lib/account/context";
import { useSupabase } from "@/app/providers";
import { FriendsDrawer } from "@/components/friends/FriendsDrawer";

export function Navbar() {
  const { setTheme, resolvedTheme } = useTheme();
  const { state, openModal } = useAccount();
  const { client } = useSupabase();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isNamed = state.status === "named";
  const avatarUrl = isNamed ? state.profile.avatar_url : null;
  const username = isNamed ? (state.profile.username ?? null) : null;
  const initial = username?.[0]?.toUpperCase() ?? null;
  const userId = isNamed ? state.profile.id : null;

  const clearNotif = useCallback(() => setNotifCount(0), []);

  // ── Poll for notifications (friend requests + unread DMs) ─────
  useEffect(() => {
    if (!isNamed || !userId) { setNotifCount(0); return; }

    const fetchCount = async () => {
      try {
        const res = await fetch("/api/friends/list");
        if (!res.ok) return;
        const data = (await res.json()) as {
          incoming: { id: string }[];
          unread_dm_count?: number;
        };
        // incoming friend requests + server-reported unread DM count
        const count = (data.incoming?.length ?? 0) + (data.unread_dm_count ?? 0);
        setNotifCount(count);
      } catch { /* ignore */ }
    };

    void fetchCount();

    // Realtime: incoming friend request → bump badge
    const channel = client
      .channel(`navbar:notif:${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "friend_requests",
        filter: `to_id=eq.${userId}`,
      }, () => setNotifCount((n) => n + 1))
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
      }, (payload) => {
        const msg = payload.new as { sender_id: string };
        if (msg.sender_id !== userId && !friendsOpen) {
          setNotifCount((n) => n + 1);
        }
      })
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }, [isNamed, userId, client, friendsOpen]);

  // Clear badge when drawer opens — but delay until after first load
  const handleOpenFriends = () => {
    setFriendsOpen(true);
    // Don't clear immediately — let the panel load first so the badge
    // and panel content are always in sync. The panel clears it once loaded.
  };

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-navy-200/60 bg-[var(--glass-bg)] backdrop-blur-xl dark:border-white/10">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Logo showWordmark priority className="relative z-10 shrink-0 scale-90 sm:scale-100" />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-28 sm:px-36">
          <div className="pointer-events-auto">
            <OnlineCountPill />
          </div>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-2">
          {/* Dark-mode toggle */}
          {mounted && (
            <button
              type="button"
              aria-label="Toggle dark mode"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-navy-200/80 bg-white/70 text-navy-600 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-400 dark:hover:bg-navy-800"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          )}

          {/* Friends button — only when signed in */}
          {isNamed && userId && (
            <>
              <button
                type="button"
                aria-label={`Friends and messages${notifCount > 0 ? ` · ${notifCount} notifications` : ""}`}
                onClick={handleOpenFriends}
                className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-navy-200/80 bg-white/70 text-navy-700 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800"
              >
                <Users className="h-4 w-4" />
                {notifCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {notifCount > 99 ? "99+" : notifCount}
                  </span>
                )}
              </button>
              <FriendsDrawer
                open={friendsOpen}
                onClose={() => setFriendsOpen(false)}
                currentUserId={userId}
                supabase={client}
                notifCount={notifCount}
                onNotifClear={clearNotif}
              />
            </>
          )}

          {/* Account button */}
          <button
            type="button"
            aria-label={isNamed ? `Account: ${username ?? "profile"}` : "Sign in or create account"}
            onClick={openModal}
            className="flex h-10 items-center gap-2 rounded-2xl border border-navy-200/80 bg-white/70 px-3 text-navy-900 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-100 dark:hover:bg-navy-800"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              {isNamed && avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : isNamed && initial ? (
                <span className="flex h-full w-full items-center justify-center rounded-lg bg-navy-200 text-xs font-bold text-navy-800 dark:bg-navy-700 dark:text-navy-100">
                  {initial}
                </span>
              ) : (
                <UserCircle className="h-5 w-5 opacity-70" />
              )}
            </span>
            <span className="hidden text-sm font-semibold sm:block">
              {isNamed ? (username ?? "Account") : "Sign in"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
