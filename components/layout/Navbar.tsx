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
  const syncNotif = useCallback((realCount: number) => setNotifCount(realCount), []);

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
        setNotifCount((data.incoming?.length ?? 0) + (data.unread_dm_count ?? 0));
      } catch { /* ignore */ }
    };

    void fetchCount();

    const channel = client
      .channel(`navbar:notif:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "friend_requests", filter: `to_id=eq.${userId}` },
        () => setNotifCount((n) => n + 1))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" },
        (payload) => {
          const msg = payload.new as { sender_id: string };
          if (msg.sender_id !== userId && !friendsOpen) setNotifCount((n) => n + 1);
        })
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }, [isNamed, userId, client, friendsOpen]);

  const handleOpenFriends = () => { setFriendsOpen(true); };

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-navy-200/60 bg-[var(--glass-bg)] backdrop-blur-xl dark:border-white/10">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center px-3 sm:h-16 sm:px-6">

        {/* Left: Logo */}
        <Logo showWordmark priority className="relative z-10 shrink-0 scale-90 sm:scale-100" />

        {/* Centre: Online pill - absolutely centred, doesn't flex-grow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">
            <OnlineCountPill />
          </div>
        </div>

        {/* Right: buttons */}
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">

          {/* Theme toggle - always visible but smaller on mobile */}
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

          {/* Friends button - signed-in only */}
          {isNamed && userId && (
            <button
              type="button"
              aria-label={`Friends${notifCount > 0 ? ` · ${notifCount}` : ""}`}
              onClick={handleOpenFriends}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-navy-200/80 bg-white/70 text-navy-700 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800 sm:h-10 sm:w-10 sm:rounded-2xl"
            >
              <Users className="h-4 w-4" />
              {notifCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </button>
          )}

          {/* FriendsDrawer always mounted — visibility controlled by open prop */}
          {userId && (
            <FriendsDrawer
              open={friendsOpen}
              onClose={() => setFriendsOpen(false)}
              currentUserId={userId}
              supabase={client}
              notifCount={notifCount}
              onNotifClear={clearNotif}
              onNotifSync={syncNotif}
            />
          )}

          {/* Account button - icon-only on mobile, label on sm+ */}
          <button
            type="button"
            aria-label={isNamed ? `Account: ${username ?? "profile"}` : "Sign in"}
            onClick={openModal}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-navy-200/80 bg-white/70 px-2 text-navy-900 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-100 dark:hover:bg-navy-800 sm:h-10 sm:gap-2 sm:rounded-2xl sm:px-3"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:h-6 sm:w-6">
              {isNamed && avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : isNamed && initial ? (
                <span className="flex h-full w-full items-center justify-center rounded-lg bg-navy-200 text-[10px] font-bold text-navy-800 dark:bg-navy-700 dark:text-navy-100 sm:text-xs">
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
