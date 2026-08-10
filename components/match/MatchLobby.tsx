"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Mars, Play, Users, Venus } from "lucide-react";
import { useSupabase } from "@/app/providers";
import { PageLoader } from "@/components/ui/Loading";
import type { SelfGender, WantsGender } from "@/lib/types/chat";
import {
  anonymousMatchGenders,
  BOT_SETTINGS_CHANGED_EVENT,
  type MatchMode,
} from "@/lib/ops/bot-settings";
import { useGlobalBotSettings, useGlobalBotSettingsLoaded } from "@/lib/ops/bot-settings-provider";
import {
  canStartMatching,
  computeEffectiveIncludeAi,
  resolveActiveGenders,
} from "@/lib/match/policy";
import { getDeviceId } from "@/lib/moderation/device-id";
import { useDailyUsage } from "@/lib/usage/daily-usage-context";
import { UpgradeModal } from "@/components/account/UpgradeModal";
import { getSessionBlockedUsers } from "@/lib/moderation/session-block";
import { normalizeBlockedUserIds } from "@/lib/moderation/blocked-user-ids";
import {
  checkMatchAccess,
  rejectBlockedRoom,
  shouldAcceptRoom,
} from "@/lib/match/room-guard";
import { MatchingLoader } from "./MatchingLoader";
import { useInactivityTimeout } from "@/lib/hooks/use-inactivity-timeout";
import {
  isMatchingPausedForInactivity,
  recordInactivitySkip,
  resetInactivityStrikes,
} from "@/lib/moderation/inactivity-strikes";
import { recordSkipAndCheckVignette } from "@/lib/ads/vignette-skip-counter";

export function MatchLobby() {
  const router = useRouter();
  const { client, ready, authError } = useSupabase();
  const [selfGender, setSelfGender] = useState<SelfGender | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("banterbird:selfGender") as SelfGender | null;
  });
  const [wantsGender, setWantsGender] = useState<WantsGender | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("banterbird:wantsGender") as WantsGender | null;
  });
  // Read the skip-rematch flag once on mount — set by ChatRoom before router.replace("/")
  // so we start in matching state immediately, skipping the idle "Find your vibe" flash.
  // Both skipRematch and pendingVignette read the same sessionStorage key; we cache the
  // parsed values in a module-level variable so the second useState sees the same result.
  const [skipRematch] = useState(() => {
    if (typeof window === "undefined") return false;
    const flag = sessionStorage.getItem("banterbird:skipRematch") === "1";
    if (flag) {
      sessionStorage.removeItem("banterbird:skipRematch");
      // Stash the parsed flag for the immediately-following pendingVignette useState.
      sessionStorage.setItem("banterbird:_skipConsumed", "1");
    }
    return flag;
  });
  // Evaluate whether a Monetag vignette should fire before the next match.
  // Uses the stashed signal written by the skipRematch initialiser above.
  const [pendingVignette] = useState(() => {
    if (typeof window === "undefined") return false;
    const wasSkip = sessionStorage.getItem("banterbird:_skipConsumed") === "1";
    sessionStorage.removeItem("banterbird:_skipConsumed");
    if (!wasSkip) return false;
    return recordSkipAndCheckVignette();
  });
  // Gate: matchmaking should not start until the vignette (if any) is done.
  const [vignetteReady, setVignetteReady] = useState(!pendingVignette);
  // True when returning from a chat room — skips the PageLoader so there's no loading flash.
  const [returningFromChat] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("banterbird:returningFromChat") === "1";
  });

  // Clear the flag after first render so subsequent fresh visits show the loader normally.
  useEffect(() => {
    sessionStorage.removeItem("banterbird:returningFromChat");
  }, []);
  const [isMatching, setIsMatching] = useState(() => skipRematch);
  const [matchRequested, setMatchRequested] = useState(() => skipRematch);
  const [hint, setHint] = useState("Pick who you are and who you want to chat with.");
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [includeAiMatch, setIncludeAiMatch] = useState(true);
  const globalBotSettings = useGlobalBotSettings();
  const globalSettingsLoaded = useGlobalBotSettingsLoaded();
  const [matchMode, setMatchMode] = useState<MatchMode | null>(null);
  const [hideGenderFilters, setHideGenderFilters] = useState<boolean | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [matchAttempt, setMatchAttempt] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const matchingPaused = isMatchingPausedForInactivity();
  const matchGendersRef = useRef<{ self: SelfGender; wants: WantsGender } | null>(null);
  const navigatedRef = useRef(false);
  const cancelledRef = useRef(false);
  /** Once set, matching loops must not restart or kill this room. */
  const matchedRoomIdRef = useRef<string | null>(null);
  const goToRoomRef = useRef<(roomId: string, uid: string) => Promise<boolean>>(async () => false);
  const dailyUsage = useDailyUsage();
  const showMatchModePicker = globalSettingsLoaded && matchMode === "user_choice";
  const effectiveIncludeAi = globalSettingsLoaded && matchMode ? computeEffectiveIncludeAi(matchMode, includeAiMatch) : false;
  const { activeSelfGender, activeWantsGender } = resolveActiveGenders(
    hideGenderFilters ?? false,
    selfGender,
    wantsGender,
    matchGendersRef.current,
  );
  const canMatch = canStartMatching(
    hideGenderFilters ?? false,
    matchRequested,
    activeSelfGender,
    activeWantsGender,
  );
  const shouldMatch = globalSettingsLoaded && canMatch && !matchingPaused && vignetteReady;

  const releaseMatchClaim = useCallback(() => {
    matchedRoomIdRef.current = null;
    navigatedRef.current = false;
    cancelledRef.current = false;
  }, []);

  const goToRoom = useCallback(
    async (roomId: string, uid: string) => {
      if (matchedRoomIdRef.current === roomId || navigatedRef.current) return true;
      if (matchedRoomIdRef.current) return true;
      if (isMatchingPausedForInactivity()) return false;

      // Claim immediately - effect restarts / AI fallback must not wipe this.
      matchedRoomIdRef.current = roomId;
      navigatedRef.current = true;
      cancelledRef.current = true;

      const access = await checkMatchAccess(client);
      if (!access.allowed) {
        releaseMatchClaim();
        if (access.reason === "blocked") setAccessBlocked(true);
        if (access.reason === "blocked") await rejectBlockedRoom(client, roomId);
        return false;
      }
      const ok = await shouldAcceptRoom(client, roomId, uid);
      if (!ok) {
        releaseMatchClaim();
        await rejectBlockedRoom(client, roomId);
        // Small backoff before re-entering the queue so both sides have time
        // to register their blocked lists and avoid an immediate re-pair loop.
        await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));
        return false;
      }
      void client.rpc("leave_match_queue");
      // Charge one gender skip now that a real match was made with a gender filter
      if (activeWantsGender && activeWantsGender !== "any" && !dailyUsage.isPro) {
        dailyUsage.consumeGenderSkip();
        void fetch("/api/usage/record-gender-skip", { method: "POST" });
      }
      router.replace(`/chat/${roomId}`);
      return true;
    },
    [client, router, releaseMatchClaim, activeWantsGender, dailyUsage],
  );

  useEffect(() => {
    goToRoomRef.current = goToRoom;
  }, [goToRoom]);

  useEffect(() => {
    if (!matchingPaused) return;
    setMatchRequested(false);
    setIsMatching(false);
    matchGendersRef.current = null;
    if (ready && client) {
      void client.rpc("leave_match_queue");
    }
  }, [matchingPaused, ready, client]);

  useEffect(() => {
    if (!globalSettingsLoaded || hideGenderFilters || matchingPaused) return;
    if (selfGender && wantsGender) {
      setMatchAttempt((n) => n + 1);
      setMatchRequested(true);
    }
  }, [globalSettingsLoaded, hideGenderFilters, matchingPaused, selfGender, wantsGender]);

  useEffect(() => {
    const handleStartMatchingEvent = () => {
      if (isMatching) return;
      if (hideGenderFilters) {
        matchGendersRef.current = anonymousMatchGenders(globalBotSettings);
      }
      setMatchRequested(true);
    };

    window.addEventListener("banterbird:start-matching", handleStartMatchingEvent);
    return () => window.removeEventListener("banterbird:start-matching", handleStartMatchingEvent);
  }, [hideGenderFilters, isMatching]);

  useEffect(() => {
    const refresh = () => {
      if (globalSettingsLoaded) {
        setMatchMode(globalBotSettings.matchMode);
        setHideGenderFilters(globalBotSettings.hideGenderFilters);
      }
    };
    refresh();
    window.addEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
  }, [globalBotSettings, globalSettingsLoaded]);

  useEffect(() => {
    if (!isMatching) {
      if (matchingPaused) {
        setHint("Matching paused after inactivity. Start again when you're ready.");
        return;
      }
      setHint(
        hideGenderFilters
          ? "Tap start to match with the next person online."
          : "Pick who you are and who you want to chat with.",
      );
      return;
    }
    setRpcError(null);
    setHint("Finding your best match now…");
  }, [isMatching, hideGenderFilters, matchingPaused]);

  useEffect(() => {
    if (!hideGenderFilters && selfGender) {
      localStorage.setItem("banterbird:selfGender", selfGender);
    }
  }, [selfGender, hideGenderFilters]);

  useEffect(() => {
    if (!hideGenderFilters && wantsGender) {
      localStorage.setItem("banterbird:wantsGender", wantsGender);
    }
  }, [wantsGender, hideGenderFilters]);

  useEffect(() => {
    if (!ready || !shouldMatch) {
      setIsMatching(false);
      return;
    }

    // Already claimed a room this session - do not reset and re-poll (kills rematch).
    if (matchedRoomIdRef.current || navigatedRef.current) {
      setIsMatching(false);
      return;
    }

    cancelledRef.current = false;
    setIsMatching(true);

    let poll: ReturnType<typeof setInterval> | undefined;
    let matchChannel: ReturnType<typeof client.channel> | null = null;
    let alive = true;
    let accessOkCached: boolean | null = null;

    const stopMatchingLoops = () => {
      alive = false;
      if (poll) {
        clearInterval(poll);
        poll = undefined;
      }
      if (matchChannel) {
        void client.removeChannel(matchChannel);
        matchChannel = null;
      }
    };

    const attemptMatch = async () => {
      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
        return { data: null, error: null };
      }
      if (isMatchingPausedForInactivity()) {
        return { data: null, error: null };
      }
      if (accessOkCached !== true) {
        const access = await checkMatchAccess(client);
        if (!access.allowed) {
          if (access.reason === "blocked") setAccessBlocked(true);
          const message =
            access.reason === "blocked"
              ? "Your access has been restricted."
              : access.reason === "unauthorized"
                ? "Sign-in failed or your session expired. Refresh the page."
                : "Could not verify access. Try refreshing.";
          return { data: null, error: { message } };
        }
        accessOkCached = true;
      }

      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
        return { data: null, error: null };
      }

      const res = await fetch("/api/match/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selfGender: activeSelfGender,
          wantsGender: activeWantsGender,
          blockedUserIds: getSessionBlockedUsers(),
          deviceId: getDeviceId(),
        }),
      });
      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
        return { data: null, error: null };
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        if (res.status === 403) {
          if (j.reason === "vpn_detected") {
            return { data: null, error: { message: "VPN and proxy connections aren't allowed. Disable yours and try again." } };
          }
          setAccessBlocked(true);
          return { data: null, error: { message: "Your access has been restricted. Contact support if you think this is a mistake." } };
        }
        if (res.status === 429 && j.reason === "daily_gender_limit") {
          return { data: null, error: null };
        }
        return { data: null, error: { message: j.error ?? "Couldn't find a match right now. Try again." } };
      }
      const j = (await res.json()) as { roomId?: string | null };
      return { data: j.roomId ?? null, error: null };
    };

    void (async () => {
      const first = await attemptMatch();
      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) return;
      if (first.error) {
        setRpcError(first.error.message);
        return;
      }
      const firstRoom = first.data as string | null;
      if (firstRoom) {
        const {
          data: { session },
        } = await client.auth.getSession();
        const uid = session?.user?.id;
        if (uid) {
          const ok = await goToRoomRef.current(firstRoom, uid);
          if (ok) stopMatchingLoops();
        }
        return;
      }

      setHint("You are in the queue. We will connect you any second…");

      const {
        data: { session },
      } = await client.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || !alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
        return;
      }

      const handleInsert = (payload: { new: Record<string, unknown> }) => {
        const id = typeof payload.new?.id === "string" ? payload.new.id : undefined;
        if (!id || !alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
          return;
        }
        void goToRoomRef.current(id, uid).then((ok) => {
          if (ok) stopMatchingLoops();
        });
      };

      const suffix =
        typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const ch = client
        .channel(`match-rooms:${uid}:${suffix}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "rooms",
            filter: `user_a=eq.${uid}`,
          },
          handleInsert,
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "rooms",
            filter: `user_b=eq.${uid}`,
          },
          handleInsert,
        );

      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
        void client.removeChannel(ch);
        return;
      }

      ch.subscribe();
      matchChannel = ch;

      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
        void client.removeChannel(ch);
        matchChannel = null;
        return;
      }

      poll = setInterval(async () => {
        if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) return;
        const { data, error } = await attemptMatch();
        if (error || !alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
          return;
        }
        const rid = data as string | null;
        if (rid) {
          const ok = await goToRoomRef.current(rid, uid);
          if (ok) stopMatchingLoops();
        }
      }, 2200);
    })();

    return () => {
      stopMatchingLoops();
      // Only cancel if we never claimed a room - otherwise a deps flicker would abort navigation.
      if (!matchedRoomIdRef.current) {
        cancelledRef.current = true;
        setIsMatching(false);
        void client.rpc("leave_match_queue");
      }
    };
  }, [client, ready, activeSelfGender, activeWantsGender, shouldMatch]);

  const clearMatchFilters = useCallback(() => {
    releaseMatchClaim();
    setSelfGender(null);
    setWantsGender(null);
    setIncludeAiMatch(true);
    setMatchRequested(false);
    matchGendersRef.current = null;
    localStorage.removeItem("banterbird:selfGender");
    localStorage.removeItem("banterbird:wantsGender");
  }, [releaseMatchClaim]);

  const handleCancelMatching = useCallback(async () => {
    cancelledRef.current = true;
    releaseMatchClaim();
    if (client) {
      await client.rpc("leave_match_queue");
    }
    clearMatchFilters();
    setIsMatching(false);
  }, [client, clearMatchFilters, releaseMatchClaim]);

  const handleInactivityWhileMatching = useCallback(async () => {
    recordInactivitySkip();
    await handleCancelMatching();
  }, [handleCancelMatching]);

  useInactivityTimeout(() => void handleInactivityWhileMatching(), isMatching);

  const handleStartMatching = useCallback(() => {
    resetInactivityStrikes();
    releaseMatchClaim();
    if (hideGenderFilters) {
      matchGendersRef.current = anonymousMatchGenders(globalBotSettings);
    }
    setMatchAttempt((n) => n + 1);
    setMatchRequested(true);
  }, [hideGenderFilters, releaseMatchClaim]);

  useEffect(() => {
    if (!ready || !shouldMatch || !effectiveIncludeAi) return;
    if (matchedRoomIdRef.current || navigatedRef.current) return;

    let alive = true;
    const delayMin = globalBotSettings.aiMatchDelayMinMs;
    const delayMax = globalBotSettings.aiMatchDelayMaxMs;
    const span = Math.max(0, delayMax - delayMin);
    const delayMs = delayMin + Math.floor(Math.random() * (span + 1));
    const t = window.setTimeout(async () => {
      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) return;
      if (isMatchingPausedForInactivity()) return;
      const access = await checkMatchAccess(client);
      if (!access.allowed) {
        if (access.reason === "blocked") setAccessBlocked(true);
        return;
      }

      if (!alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) return;
      const {
        data: { session },
      } = await client.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const blockedIds = normalizeBlockedUserIds(getSessionBlockedUsers());

      // Also exclude current friends and server-side skip blocks
      const { data: friendships } = await client
        .from("friendships")
        .select("friend_id")
        .eq("user_id", uid);
      const friendIds = (friendships ?? []).map((f: { friend_id: string }) => f.friend_id);
      const friendIdSet = new Set(friendIds);
      const modBlocked = blockedIds.filter((id) => !friendIdSet.has(id));

      // Fetch DB session blocks (both directions)
      const nowIso = new Date().toISOString();
      const [{ data: asBlocker }, { data: asBlocked }] = await Promise.all([
        client.from("session_blocks").select("blocked_id").eq("blocker_id", uid).gt("expires_at", nowIso),
        client.from("session_blocks").select("blocker_id").eq("blocked_id", uid).gt("expires_at", nowIso),
      ]);
      const dbBlocked = [
        ...((asBlocker ?? []).map((r: { blocked_id: string }) => r.blocked_id)),
        ...((asBlocked ?? []).map((r: { blocker_id: string }) => r.blocker_id)),
      ];

      const allBlocked = Array.from(new Set([...modBlocked, ...friendIds, ...dbBlocked]));

      const { data, error } = await client.rpc("try_match_ai_practice", {
        p_self_gender: activeSelfGender,
        p_wants_gender: activeWantsGender,
        p_blocked_user_ids: allBlocked,
      });
      if (error || !alive || cancelledRef.current || navigatedRef.current || matchedRoomIdRef.current) {
        return;
      }
      const rid = data as string | null;
      if (rid) await goToRoomRef.current(rid, uid);
    }, delayMs);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [
    client,
    ready,
    activeSelfGender,
    activeWantsGender,
    effectiveIncludeAi,
    shouldMatch,
    globalBotSettings.aiMatchDelayMinMs,
    globalBotSettings.aiMatchDelayMaxMs,
  ]);

  if (!ready || !globalSettingsLoaded) {
    // When returning from a chat the session is already live — skip the loader
    // so there's no flash before "Find your vibe" appears.
    if (!returningFromChat) {
      return <PageLoader label={!ready ? "Preparing your session…" : "Loading match settings…"} />;
    }
  }

  if (authError) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          Could not start an anonymous session.
        </p>
        <p className="mt-4 text-xs text-navy-600 dark:text-navy-400">{authError}</p>
        <p className="mt-4 text-xs text-navy-600 dark:text-navy-400">
          In Supabase: Authentication → Providers → enable <strong>Anonymous</strong> sign-ins,
          then wait about a minute (auth rate limits reset) and refresh this page.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white dark:bg-navy-100 dark:text-navy-950"
        >
          Refresh page
        </button>
      </div>
    );
  }

  if (accessBlocked) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          Your access has been restricted.
        </p>
        <p className="mt-4 text-xs text-navy-600 dark:text-navy-400">
          This account, device, or network has been blocked by moderation. You cannot match or chat.
        </p>
      </div>
    );
  }

  if (rpcError) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{rpcError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white dark:bg-navy-100 dark:text-navy-950"
        >
          Refresh page
        </button>
      </div>
    );
  }

  if (isMatching || pendingVignette) {
    return (
      <MatchingLoader
        key={matchAttempt}
        onCancel={handleCancelMatching}
        showVignette={pendingVignette && !vignetteReady}
        onVignetteDone={() => setVignetteReady(true)}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 md:gap-7 -mt-6 sm:mt-0">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel w-full rounded-3xl border border-navy-200/70 p-5 shadow-xl sm:rounded-[2rem] sm:p-7 dark:border-white/10"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold text-navy-950 sm:text-2xl dark:text-navy-50">Meet someone new</h1>
          <p className="mt-2 text-sm text-navy-700 sm:text-base dark:text-navy-300">{hint}</p>
        </div>

        {hideGenderFilters ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartMatching}
              className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-navy-900 px-8 py-4 text-base font-semibold text-white shadow-lg dark:bg-navy-100 dark:text-navy-950"
            >
              <Play className="h-5 w-5" aria-hidden />
              Start matching
            </motion.button>
            <p className="max-w-sm text-center text-xs text-navy-600 dark:text-navy-400">
              You will be paired with the next available stranger. Gender is not shown.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {showMatchModePicker ? (
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-600 dark:text-navy-400">
                  Match mode
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setIncludeAiMatch(true)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      includeAiMatch
                        ? "border-violet-500/45 bg-violet-500/10 text-violet-950 shadow-sm dark:text-violet-100"
                        : "border-navy-200/70 bg-white/80 text-navy-900 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Bot className="h-4 w-4 shrink-0" />
                      Humans + practice bot
                    </span>
                    <span className="mt-1 block text-xs font-normal text-navy-600 dark:text-navy-400">
                      If no one appears after a few seconds, you may get a labeled AI partner.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncludeAiMatch(false)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      !includeAiMatch
                        ? "border-amber-500/45 bg-amber-500/10 text-amber-950 shadow-sm dark:text-amber-100"
                        : "border-navy-200/70 bg-white/80 text-navy-900 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0" />
                      Humans only
                    </span>
                    <span className="mt-1 block text-xs font-normal text-navy-600 dark:text-navy-400">
                      Wait as long as it takes for a real person.
                    </span>
                  </button>
                </div>
              </section>
            ) : null}

            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-600 dark:text-navy-400">
                Your gender
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelfGender("male")}
                  className={`flex items-center rounded-2xl border px-4 py-3 text-left transition ${
                    selfGender === "male"
                      ? "border-blue-500/45 bg-blue-500/10 text-blue-900 shadow-sm dark:text-blue-200"
                      : "border-navy-200/70 bg-white/80 text-navy-900 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                  }`}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Mars className="h-4 w-4" /> Male
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelfGender("female")}
                  className={`flex items-center rounded-2xl border px-4 py-3 text-left transition ${
                    selfGender === "female"
                      ? "border-pink-500/45 bg-pink-500/10 text-pink-900 shadow-sm dark:text-pink-200"
                      : "border-navy-200/70 bg-white/80 text-navy-900 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                  }`}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Venus className="h-4 w-4" /> Female
                  </span>
                </button>
              </div>
            </section>

            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-600 dark:text-navy-400">
                You want to speak to
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { value: "male" as const, label: "Men" },
                  { value: "female" as const, label: "Women" },
                  { value: "any" as const, label: "Regardless" },
                ].map((option) => {
                  const isGenderFiltered = option.value !== "any";
                  const limitHit =
                    isGenderFiltered &&
                    !dailyUsage.isPro &&
                    dailyUsage.genderSkipsRemaining === 0;
                  const remaining =
                    isGenderFiltered && !dailyUsage.isPro
                      ? dailyUsage.genderSkipsRemaining
                      : null;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (limitHit) {
                          setShowUpgradeModal(true);
                          return;
                        }
                        setWantsGender(option.value);
                      }}
                      className={`relative rounded-2xl border px-4 py-3 text-sm font-semibold transition ${option.value === "any" ? "col-span-2 sm:col-span-1" : ""} ${
                        wantsGender === option.value
                          ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-900 shadow-sm dark:text-emerald-200"
                          : limitHit
                            ? "cursor-not-allowed border-rose-400/40 bg-rose-50/60 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-400"
                            : "border-navy-200/70 bg-white/80 text-navy-900 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                      }`}
                    >
                      {option.label}
                      {/* Badge: remaining gender skips on this button */}
                      {remaining !== null && remaining !== undefined && (
                        <span
                          className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold leading-none ${
                            remaining === 0
                              ? "bg-rose-500 text-white"
                              : "bg-amber-400 text-navy-950"
                          }`}
                          aria-label={`${remaining} uses remaining`}
                        >
                          {remaining}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {!dailyUsage.isPro && dailyUsage.genderSkipsRemaining !== null && (
                <p className="mt-2 text-center text-[11px] text-navy-500 dark:text-navy-400">
                  {dailyUsage.genderSkipsRemaining === 0 ? (
                    <>
                      Gender matches used up for today.{" "}
                      <button
                        type="button"
                        onClick={() => setShowUpgradeModal(true)}
                        className="font-semibold text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
                      >
                        Upgrade to PRO
                      </button>{" "}
                      for unlimited.
                    </>
                  ) : (
                    <>{dailyUsage.genderSkipsRemaining} gender match{dailyUsage.genderSkipsRemaining === 1 ? "" : "es"} left today</>
                  )}
                </p>
              )}
            </section>

            {matchingPaused ? (
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartMatching}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 px-8 py-4 text-base font-semibold text-white shadow-lg dark:bg-navy-100 dark:text-navy-950"
              >
                <Play className="h-5 w-5" aria-hidden />
                Start matching
              </motion.button>
            ) : null}
          </div>
        )}
      </motion.div>

      <UpgradeModal open={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </div>
  );
}
