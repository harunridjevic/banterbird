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
import { getSessionBlockedUsers } from "@/lib/moderation/session-block";
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
  const [isMatching, setIsMatching] = useState(false);
  const [matchRequested, setMatchRequested] = useState(false);
  const [hint, setHint] = useState("Pick who you are and who you want to talk to.");
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [includeAiMatch, setIncludeAiMatch] = useState(true);
  const globalBotSettings = useGlobalBotSettings();
  const globalSettingsLoaded = useGlobalBotSettingsLoaded();
  const [matchMode, setMatchMode] = useState<MatchMode | null>(null);
  const [hideGenderFilters, setHideGenderFilters] = useState<boolean | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const matchingPaused = isMatchingPausedForInactivity();
  const matchGendersRef = useRef<{ self: SelfGender; wants: WantsGender } | null>(null);
  const navigatedRef = useRef(false);
  const cancelledRef = useRef(false);
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
  const shouldMatch = globalSettingsLoaded && canMatch && !matchingPaused;

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
      setMatchRequested(true);
    }
  }, [globalSettingsLoaded, hideGenderFilters, matchingPaused, selfGender, wantsGender]);

  useEffect(() => {
    const handleStartMatchingEvent = () => {
      if (isMatching) return;
      if (hideGenderFilters) {
        matchGendersRef.current = anonymousMatchGenders();
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
          : "Pick who you are and who you want to talk to.",
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
    cancelledRef.current = false;
    navigatedRef.current = false;
    if (!ready || !shouldMatch) {
      setIsMatching(false);
      return;
    }

    setIsMatching(true);

    let poll: ReturnType<typeof setInterval> | undefined;
    let matchChannel: ReturnType<typeof client.channel> | null = null;
    let alive = true;

    const attemptMatch = async () => {
      if (isMatchingPausedForInactivity()) {
        return { data: null, error: null };
      }
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
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        if (res.status === 403) {
          setAccessBlocked(true);
          return { data: null, error: { message: j.error ?? "Your access has been restricted." } };
        }
        if (res.status === 429 && (j.reason === "rate_limit" || j.reason === "burst_limit")) {
          setAccessBlocked(true);
          return { data: null, error: { message: j.error ?? "Spam detected. Access temporarily restricted." } };
        }
        return { data: null, error: { message: j.error ?? `Match failed (${res.status})` } };
      }
      const j = (await res.json()) as { roomId?: string | null };
      return { data: j.roomId ?? null, error: null };
    };

    const goToRoom = async (roomId: string, uid: string) => {
      if (isMatchingPausedForInactivity()) return false;
      const access = await checkMatchAccess(client);
      if (!access.allowed) {
        if (access.reason === "blocked") setAccessBlocked(true);
        await rejectBlockedRoom(client, roomId);
        return false;
      }
      const ok = await shouldAcceptRoom(client, roomId, uid);
      if (!ok) {
        await rejectBlockedRoom(client, roomId);
        return false;
      }
      navigatedRef.current = true;
      router.replace(`/chat/${roomId}`);
      return true;
    };

    void (async () => {
      const first = await attemptMatch();
      if (!alive || cancelledRef.current) return;
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
        if (uid) await goToRoom(firstRoom, uid);
        return;
      }

      setHint("You are in the queue. We will connect you any second…");

      const {
        data: { session },
      } = await client.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || !alive || cancelledRef.current) return;

      const handleInsert = (payload: { new: Record<string, unknown> }) => {
        const id = typeof payload.new?.id === "string" ? payload.new.id : undefined;
        if (!id || !alive || cancelledRef.current) return;
        void goToRoom(id, uid);
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

      if (!alive || cancelledRef.current) {
        void client.removeChannel(ch);
        return;
      }

      ch.subscribe();
      matchChannel = ch;

      if (!alive || cancelledRef.current) {
        void client.removeChannel(ch);
        matchChannel = null;
        return;
      }

      poll = setInterval(async () => {
        if (!alive || cancelledRef.current) return;
        const { data, error } = await attemptMatch();
        if (error || !alive || cancelledRef.current) return;
        const rid = data as string | null;
        if (rid) await goToRoom(rid, uid);
      }, 2800);
    })();

    return () => {
      alive = false;
      cancelledRef.current = true;
      if (poll) clearInterval(poll);
      setIsMatching(false);
      void client.rpc("leave_match_queue");
      if (matchChannel) void client.removeChannel(matchChannel);
    };
  }, [client, ready, router, activeSelfGender, activeWantsGender, shouldMatch]);

  const clearMatchFilters = useCallback(() => {
    setSelfGender(null);
    setWantsGender(null);
    setIncludeAiMatch(true);
    setMatchRequested(false);
    matchGendersRef.current = null;
    localStorage.removeItem("banterbird:selfGender");
    localStorage.removeItem("banterbird:wantsGender");
  }, []);

  const handleCancelMatching = useCallback(async () => {
    cancelledRef.current = true;
    if (client) {
      await client.rpc("leave_match_queue");
    }
    clearMatchFilters();
    setIsMatching(false);
  }, [client, clearMatchFilters]);

  const handleInactivityWhileMatching = useCallback(async () => {
    recordInactivitySkip();
    await handleCancelMatching();
  }, [handleCancelMatching]);

  useInactivityTimeout(() => void handleInactivityWhileMatching(), isMatching);

  const handleStartMatching = useCallback(() => {
    resetInactivityStrikes();
    if (hideGenderFilters) {
      matchGendersRef.current = anonymousMatchGenders();
    }
    setMatchRequested(true);
  }, [hideGenderFilters]);

  useEffect(() => {
    if (!ready || !shouldMatch || !effectiveIncludeAi) return;
    let alive = true;
    const s = globalBotSettings;
    const span = Math.max(0, s.aiMatchDelayMaxMs - s.aiMatchDelayMinMs);
    const delayMs = s.aiMatchDelayMinMs + Math.floor(Math.random() * (span + 1));
    const t = window.setTimeout(async () => {
      if (!alive || cancelledRef.current || navigatedRef.current) return;
      if (isMatchingPausedForInactivity()) return;
      const access = await checkMatchAccess(client);
      if (!access.allowed) {
        if (access.reason === "blocked") setAccessBlocked(true);
        return;
      }
      const { data, error } = await client.rpc("try_match_ai_practice", {
        p_self_gender: activeSelfGender,
        p_wants_gender: activeWantsGender,
      });
      if (error || !alive || cancelledRef.current || navigatedRef.current) return;
      const rid = data as string | null;
      if (rid) {
        navigatedRef.current = true;
        router.replace(`/chat/${rid}`);
      }
    }, delayMs);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [client, ready, router, activeSelfGender, activeWantsGender, effectiveIncludeAi, shouldMatch, globalBotSettings]);

  if (!ready) {
    return <PageLoader label="Preparing your session…" />;
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

  if (isMatching) {
    return <MatchingLoader onCancel={handleCancelMatching} />;
  }

  return (
    <div className="mx-auto flex w-full flex-col items-center gap-4 md:gap-7">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel w-full rounded-3xl border border-navy-200/70 p-5 shadow-xl sm:rounded-[2rem] sm:p-7 dark:border-white/10"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold text-navy-950 sm:text-2xl dark:text-navy-50">Find your vibe</h1>
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
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
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
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
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
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setWantsGender(option.value)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      wantsGender === option.value
                        ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-900 shadow-sm dark:text-emerald-200"
                        : "border-navy-200/70 bg-white/80 text-navy-900 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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
    </div>
  );
}
