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
import { ProBadge } from "@/components/account/ProBadge";
import { isProActive } from "@/lib/account/types";

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
  const showPro = isNamed && isProActive(state.profile);

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
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "friend_requests",
        filter: `to_id=eq.${userId}`,
      }, () => setNotifCount((n) => n + 1))
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }, [isNamed, userId, client]);

  const handleOpenFriends = () => { setFriendsOpen(true); };

  return (
    <header
      className="shrink-0 border-b border-navy-200/60 bg-[var(--glass-bg)] backdrop-blur-xl dark:border-white/10"
      style={{ zIndex: 50 }}
    >
      <div className="relative mx-auto flex max-w-6xl items-center h-14 px-3 sm:h-16 sm:px-6">
        {/* Left: Logo + PRO badge — pinned to left edge */}
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          <Logo
            showWordmark
            priority
            className="shrink-0 scale-90 sm:scale-100"
          />
          {showPro && <ProBadge size="sm" />}
        </div>

        {/* Centre: Online pill — absolutely centered but pointer-events safe */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">
            <OnlineCountPill />
          </div>
        </div>

        {/* Right: buttons */}
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">

          {/* Theme toggle */}
          {mounted && (
            <button
              type="button"
              aria-label="Toggle dark mode"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-navy-200/80 bg-white/70 text-navy-600 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-400 dark:hover:bg-navy-800"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark"
                ? <Sun className="h-4 w-4" />
                : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* Friends button */}
          {isNamed && userId && (
            <button
              type="button"
              aria-label={`Friends${notifCount > 0 ? ` · ${notifCount}` : ""}`}
              onClick={handleOpenFriends}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-navy-200/80 bg-white/70 text-navy-700 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800 sm:h-10 sm:w-10 sm:rounded-2xl"
            >
              <Users className="h-4 w-4" />
              {notifCount > 0 && !friendsOpen && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </button>
          )}

          {/* FriendsDrawer */}
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

          {/* Account button */}
          <button
            type="button"
            aria-label={isNamed ? `Account: ${username ?? "profile"}` : "Sign in"}
            onClick={openModal}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-navy-200/80 bg-white/70 px-2 text-navy-900 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-100 dark:hover:bg-navy-800 sm:h-10 sm:gap-2 sm:rounded-2xl sm:px-3"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md sm:h-6 sm:w-6">
              {isNamed && avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : isNamed && initial ? (
                <span className="flex h-full w-full items-center justify-center rounded-md bg-navy-200 text-[10px] font-bold text-navy-800 dark:bg-navy-700 dark:text-navy-100">
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
