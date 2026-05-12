"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useSupabase } from "@/app/providers";
import { PageLoader } from "@/components/ui/Loading";

export function MatchLobby() {
  const router = useRouter();
  const { client, ready } = useSupabase();
  const [hint, setHint] = useState("Finding someone for you…");
  const [rpcError, setRpcError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!ready) return;

    let poll: ReturnType<typeof setInterval> | undefined;
    const channels: ReturnType<typeof client.channel>[] = [];

    void (async () => {
      const first = await client.rpc("try_match");
      if (cancelledRef.current) return;
      if (first.error) {
        setRpcError(first.error.message);
        return;
      }
      const firstRoom = first.data as string | null;
      if (firstRoom) {
        router.replace(`/chat/${firstRoom}`);
        return;
      }

      setHint("You are in the queue. We will connect you any second…");

      const {
        data: { session },
      } = await client.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || cancelledRef.current) return;

      const handleInsert = (payload: { new: Record<string, unknown> }) => {
        const id = typeof payload.new?.id === "string" ? payload.new.id : undefined;
        if (id && !cancelledRef.current) router.replace(`/chat/${id}`);
      };

      const chA = client
        .channel(`match-rooms-a:${uid}`)
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
        .subscribe();
      channels.push(chA);

      const chB = client
        .channel(`match-rooms-b:${uid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "rooms",
            filter: `user_b=eq.${uid}`,
          },
          handleInsert,
        )
        .subscribe();
      channels.push(chB);

      poll = setInterval(async () => {
        if (cancelledRef.current) return;
        const { data, error } = await client.rpc("try_match");
        if (error || cancelledRef.current) return;
        const rid = data as string | null;
        if (rid) router.replace(`/chat/${rid}`);
      }, 2800);
    })();

    return () => {
      cancelledRef.current = true;
      if (poll) clearInterval(poll);
      void client.rpc("leave_match_queue");
      for (const c of channels) void client.removeChannel(c);
    };
  }, [client, ready, router]);

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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-8 px-4">
      <motion.div
        className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border border-navy-200/60 bg-white/50 shadow-lg dark:border-white/10 dark:bg-navy-900/40"
        animate={{ scale: [1, 1.03, 1], rotate: [0, 1.5, -1.5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles className="h-10 w-10 text-navy-800 dark:text-navy-100" />
        <motion.span
          className="absolute inset-0 rounded-[2rem] border-2 border-navy-900/20 dark:border-white/20"
          animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.08, 1] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
      </motion.div>
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="text-xl font-semibold text-navy-950 dark:text-navy-50">Matching</h1>
        <p className="text-sm leading-relaxed text-navy-600 dark:text-navy-300">{hint}</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-navy-800 dark:bg-navy-200"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -5, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
