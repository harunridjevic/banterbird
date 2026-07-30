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

/** Returns true when the mobile virtual keyboard is open (visualViewport shrinks). */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Keyboard is considered open when viewport height drops more than 120px
      // below the window height — avoids false positives from browser chrome.
      setOpen(window.innerHeight - vv.height > 120);
    };
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  return open;
}

export function Navbar() {
  const { setTheme, resolvedTheme } = useTheme();
  const { state, openModal } = useAccount();
  const { client } = useSupabase();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const keyboardOpen = useKeyboardOpen();

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

  // Compact mode: keyboard is open AND we're on a mobile-width screen.
  // On desktop, visualViewport never shrinks for a keyboard so this is
  // effectively mobile-only already, but we gate it explicitly to be safe.
  const compact = keyboardOpen;

  return (
    <header
      className="shrink-0 border-b border-navy-200/60 bg-[var(--glass-bg)] backdrop-blur-xl dark:border-white/10"
      style={{ zIndex: 50, overflow: "hidden" }}
    >
      <div
        className={`relative mx-auto flex max-w-6xl items-center px-3 transition-[height] duration-150 ${
          compact ? "h-10" : "h-14 sm:h-16"
        } ${compact ? "px-2" : "sm:px-6"}`}
      >
        {/* Left: Logo — hide wordmark when compact to save space */}
        <Logo
          showWordmark={!compact}
          priority
          className={`relative z-10 shrink-0 transition-all duration-150 ${compact ? "scale-75" : "scale-90 sm:scale-100"}`}
        />

        {/* Centre: Online pill */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">
            {!compact && <OnlineCountPill />}
          </div>
        </div>

        {/* Right: buttons */}
        <div className={`relative z-10 ml-auto flex shrink-0 items-center ${compact ? "gap-1" : "gap-1.5 sm:gap-2"}`}>

          {/* Theme toggle */}
          {mounted && (
            <button
              type="button"
              aria-label="Toggle dark mode"
              className={`flex items-center justify-center rounded-xl border border-navy-200/80 bg-white/70 text-navy-600 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-400 dark:hover:bg-navy-800 ${
                compact ? "h-7 w-7 rounded-lg" : "h-8 w-8"
              }`}
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark"
                ? <Sun className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                : <Moon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />}
            </button>
          )}

          {/* Friends button */}
          {isNamed && userId && (
            <button
              type="button"
              aria-label={`Friends${notifCount > 0 ? ` · ${notifCount}` : ""}`}
              onClick={handleOpenFriends}
              className={`relative flex items-center justify-center rounded-xl border border-navy-200/80 bg-white/70 text-navy-700 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800 ${
                compact ? "h-7 w-7 rounded-lg" : "h-8 w-8 sm:h-10 sm:w-10 sm:rounded-2xl"
              }`}
            >
              <Users className={compact ? "h-3 w-3" : "h-4 w-4"} />
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
            className={`flex items-center gap-1.5 rounded-xl border border-navy-200/80 bg-white/70 text-navy-900 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-100 dark:hover:bg-navy-800 ${
              compact
                ? "h-7 px-1.5 rounded-lg"
                : "h-8 px-2 sm:h-10 sm:gap-2 sm:rounded-2xl sm:px-3"
            }`}
          >
            <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${compact ? "h-4 w-4" : "h-5 w-5 sm:h-6 sm:w-6"}`}>
              {isNamed && avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : isNamed && initial ? (
                <span className="flex h-full w-full items-center justify-center rounded-lg bg-navy-200 text-[10px] font-bold text-navy-800 dark:bg-navy-700 dark:text-navy-100">
                  {initial}
                </span>
              ) : (
                <UserCircle className={compact ? "h-4 w-4 opacity-70" : "h-5 w-5 opacity-70"} />
              )}
            </span>
            {/* Label hidden in compact mode and on mobile normally */}
            {!compact && (
              <span className="hidden text-sm font-semibold sm:block">
                {isNamed ? (username ?? "Account") : "Sign in"}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
