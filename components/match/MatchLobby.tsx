"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Mars, Sparkles, Users, Venus } from "lucide-react";
import { useSupabase } from "@/app/providers";
import { PageLoader } from "@/components/ui/Loading";
import type { SelfGender, WantsGender } from "@/lib/types/chat";

export function MatchLobby() {
  const router = useRouter();
  const { client, ready } = useSupabase();
  const [selfGender, setSelfGender] = useState<SelfGender | null>(null);
  const [wantsGender, setWantsGender] = useState<WantsGender | null>(null);
  const [hint, setHint] = useState("Pick who you are and who you want to talk to.");
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [includeAiMatch, setIncludeAiMatch] = useState(true);
  const navigatedRef = useRef(false);
  const cancelledRef = useRef(false);
  const canMatch = !!selfGender && !!wantsGender;

  useEffect(() => {
    cancelledRef.current = false;
    navigatedRef.current = false;
    if (!ready || !selfGender || !wantsGender) return;

    let poll: ReturnType<typeof setInterval> | undefined;
    let matchChannel: ReturnType<typeof client.channel> | null = null;
    let alive = true;

    setRpcError(null);
    setHint("Finding your best match now…");

    const attemptMatch = async () => {
      const result = await client.rpc("try_match", {
        p_self_gender: selfGender,
        p_wants_gender: wantsGender,
      });
      return result;
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
        navigatedRef.current = true;
        router.replace(`/chat/${firstRoom}`);
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
        if (id && alive && !cancelledRef.current) {
          navigatedRef.current = true;
          router.replace(`/chat/${id}`);
        }
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
        if (rid) {
          navigatedRef.current = true;
          router.replace(`/chat/${rid}`);
        }
      }, 2800);
    })();

    return () => {
      alive = false;
      cancelledRef.current = true;
      if (poll) clearInterval(poll);
      void client.rpc("leave_match_queue");
      if (matchChannel) void client.removeChannel(matchChannel);
    };
  }, [client, ready, router, selfGender, wantsGender]);

  useEffect(() => {
    if (!ready || !selfGender || !wantsGender || !includeAiMatch) return;
    let alive = true;
    const delayMs = 3600 + Math.floor(Math.random() * 1600);
    const t = window.setTimeout(async () => {
      if (!alive || cancelledRef.current || navigatedRef.current) return;
      const { data, error } = await client.rpc("try_match_ai_practice", {
        p_self_gender: selfGender,
        p_wants_gender: wantsGender,
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
  }, [client, ready, router, selfGender, wantsGender, includeAiMatch]);

  if (!ready) {
    return <PageLoader label="Preparing your session…" />;
  }

  if (rpcError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{rpcError}</p>
        <p className="mt-4 text-xs text-navy-500 dark:text-navy-400">
          Check that Anonymous sign-ins are enabled in Supabase Authentication providers, and that the
          database migration has been applied.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[62vh] w-full max-w-2xl flex-col items-center justify-center gap-7 px-2 sm:px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel w-full rounded-[2rem] border border-navy-200/70 p-6 shadow-xl dark:border-white/10 sm:p-7"
      >
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-navy-950 dark:text-navy-50">Find your vibe</h1>
          <p className="mt-2 text-sm text-navy-600 dark:text-navy-300">{hint}</p>
        </div>

        <div className="mt-6 space-y-6">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
              Match mode
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIncludeAiMatch(true)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  includeAiMatch
                    ? "border-violet-500/45 bg-violet-500/10 text-violet-950 shadow-sm dark:text-violet-100"
                    : "border-navy-200/70 bg-white/55 text-navy-700 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Bot className="h-4 w-4 shrink-0" />
                  Humans + practice bot
                </span>
                <span className="mt-1 block text-xs font-normal text-navy-500 dark:text-navy-400">
                  If no one appears after a few seconds, you may get a labeled AI partner.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIncludeAiMatch(false)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  !includeAiMatch
                    ? "border-amber-500/45 bg-amber-500/10 text-amber-950 shadow-sm dark:text-amber-100"
                    : "border-navy-200/70 bg-white/55 text-navy-700 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0" />
                  Humans only
                </span>
                <span className="mt-1 block text-xs font-normal text-navy-500 dark:text-navy-400">
                  Wait as long as it takes for a real person.
                </span>
              </button>
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
              Your gender
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelfGender("male")}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  selfGender === "male"
                    ? "border-blue-500/45 bg-blue-500/10 text-blue-900 shadow-sm dark:text-blue-200"
                    : "border-navy-200/70 bg-white/55 text-navy-700 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
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
                    : "border-navy-200/70 bg-white/55 text-navy-700 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                }`}
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Venus className="h-4 w-4" /> Female
                </span>
              </button>
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
              You want to speak to
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                      : "border-navy-200/70 bg-white/55 text-navy-700 hover:border-navy-300 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </motion.div>

      {canMatch ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.div
            className="relative flex h-20 w-20 items-center justify-center rounded-[1.5rem] border border-navy-200/60 bg-white/50 shadow-lg dark:border-white/10 dark:bg-navy-900/40"
            animate={{ scale: [1, 1.04, 1], rotate: [0, 1.5, -1.5, 0] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-8 w-8 text-navy-800 dark:text-navy-100" />
            <motion.span
              className="absolute inset-0 rounded-[1.5rem] border-2 border-navy-900/20 dark:border-white/20"
              animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.08, 1] }}
              transition={{ duration: 1.9, repeat: Infinity }}
            />
          </motion.div>
          <div className="inline-flex items-center gap-2 rounded-full border border-navy-200/70 bg-white/60 px-3 py-1.5 text-xs font-medium text-navy-700 shadow-sm dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-200">
            <Users className="h-3.5 w-3.5" />
            Matching now
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
