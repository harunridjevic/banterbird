"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useSupabase } from "@/app/providers";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { MessageList } from "@/components/chat/MessageList";
import { PageLoader } from "@/components/ui/Loading";
import type { MessageRow } from "@/lib/types/chat";

type Props = { roomId: string };

export function ChatRoom({ roomId }: Props) {
  const router = useRouter();
  const { client, ready } = useSupabase();
  const [selfId, setSelfId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof client.channel> | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selfIdRef.current = selfId;
  }, [selfId]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, peerTyping]);

  const load = useCallback(async () => {
    if (!ready) return;
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session?.user?.id) {
      setError("Could not start session.");
      setLoading(false);
      return;
    }
    setSelfId(session.user.id);

    const { data: room, error: roomErr } = await client
      .from("rooms")
      .select("id,user_a,user_b,ended_at")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !room) {
      setError("This chat does not exist or you do not have access.");
      setLoading(false);
      return;
    }
    if (room.user_a !== session.user.id && room.user_b !== session.user.id) {
      setError("You are not a participant in this chat.");
      setLoading(false);
      return;
    }
    if (room.ended_at) {
      router.replace("/match");
      return;
    }

    const { data: msgs, error: msgErr } = await client
      .from("messages")
      .select("id,room_id,user_id,content,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (msgErr) {
      setError(msgErr.message);
      setLoading(false);
      return;
    }
    setMessages((msgs ?? []) as MessageRow[]);
    setLoading(false);
  }, [client, ready, roomId, router]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    if (!ready || !roomId) return;

    const channel = client
      .channel(`room:${roomId}:msg`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, ready, roomId]);

  useEffect(() => {
    if (!ready || !roomId) return;

    const bc = client
      .channel(`room:${roomId}:typing`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { userId?: string; active?: boolean };
        if (!p?.userId || p.userId === selfIdRef.current) return;
        if (p.active) {
          setPeerTyping(true);
          if (typingHide.current) clearTimeout(typingHide.current);
          typingHide.current = setTimeout(() => setPeerTyping(false), 2000);
        } else {
          setPeerTyping(false);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          typingChannelRef.current = bc;
        }
      });

    return () => {
      if (typingHide.current) clearTimeout(typingHide.current);
      typingChannelRef.current = null;
      void client.removeChannel(bc);
    };
  }, [client, ready, roomId]);

  const sendTypingBroadcast = useCallback(
    async (active: boolean) => {
      const ch = typingChannelRef.current;
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!ch || !session?.user?.id) return;
      await ch.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: session.user.id, active },
      });
    },
    [client],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session?.user?.id) return;
      const { error: insErr } = await client.from("messages").insert({
        room_id: roomId,
        user_id: session.user.id,
        content: text,
      });
      if (insErr) {
        setError(insErr.message);
      }
    },
    [client, roomId],
  );

  const leaveChat = useCallback(async () => {
    await client.rpc("end_active_room", { p_room_id: roomId });
    router.push("/match");
  }, [client, roomId, router]);

  const typingLabel = useMemo(() => {
    if (!peerTyping) return null;
    return (
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 pb-1 text-xs text-navy-500 dark:text-navy-400"
      >
        Stranger is typing…
      </motion.p>
    );
  }, [peerTyping]);

  if (loading || !selfId) {
    return <PageLoader label="Opening your chat…" />;
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-20 text-center">
        <MessageCircle className="h-12 w-12 text-navy-400" />
        <p className="text-navy-700 dark:text-navy-200">{error}</p>
        <Link
          href="/match"
          className="rounded-2xl bg-navy-900 px-6 py-3 text-sm font-semibold text-white dark:bg-navy-100 dark:text-navy-950"
        >
          Back to matching
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-navy-200/60 px-3 py-3 dark:border-white/10 sm:px-4">
        <Link
          href="/match"
          className="inline-flex items-center gap-2 rounded-2xl px-2 py-2 text-sm font-medium text-navy-700 transition hover:bg-navy-900/5 dark:text-navy-200 dark:hover:bg-white/5"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Match</span>
        </Link>
        <div className="text-center">
          <p className="text-sm font-semibold text-navy-950 dark:text-navy-50">Anonymous chat</p>
          <p className="text-xs text-navy-500 dark:text-navy-400">You are both strangers — stay kind.</p>
        </div>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => void leaveChat()}
          className="rounded-2xl border border-navy-200/80 bg-white/60 px-3 py-2 text-xs font-semibold text-navy-800 shadow-sm dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-100"
        >
          End chat
        </motion.button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-3xl border border-navy-200/60 bg-white/50 px-6 py-8 dark:border-white/10 dark:bg-navy-900/30"
            >
              <p className="text-sm font-medium text-navy-800 dark:text-navy-100">No messages yet</p>
              <p className="mt-2 max-w-xs text-xs text-navy-500 dark:text-navy-400">
                Say hi — your match is on the other side of this glassy little bubble.
              </p>
            </motion.div>
          </div>
        ) : (
          <MessageList messages={messages} selfId={selfId} />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 space-y-1 border-t border-navy-200/50 bg-[var(--page-bg)]/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:border-white/10">
        {typingLabel}
        <ChatComposer
          onSend={sendMessage}
          onTypingChange={(typing) => void sendTypingBroadcast(typing)}
        />
      </div>
    </div>
  );
}
