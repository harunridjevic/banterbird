"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bot, Mars, MessageCircle, SkipForward, Venus } from "lucide-react";
import { useSupabase } from "@/app/providers";
import { executeBotTurn, type BotApiBody } from "@/components/chat/bot-turn";
import {
  armGhostSchedule,
  createGhostSchedule,
  disarmGhostSchedule,
  isBotMessage,
} from "@/components/chat/ghost-watch";
import { shouldClientSkipChat } from "@/lib/ai-practice-bot/client-skip";
import { buildBotPersona, type BotPersona } from "@/lib/ai-practice-bot/persona";
import {
  BOT_SETTINGS_CHANGED_EVENT,
  loadBotSettings,
  resolveOpenerDelayMs,
  type BotSettings,
} from "@/lib/ops/bot-settings";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { MessageList } from "@/components/chat/MessageList";
import { PageLoader } from "@/components/ui/Loading";
import type { MessageRow, SelfGender } from "@/lib/types/chat";
import { tabCloseFetch } from "@/lib/presence/tab-close-fetch";

type Props = { roomId: string };

export function ChatRoom({ roomId }: Props) {
  const router = useRouter();
  const { client, ready } = useSupabase();
  const [selfId, setSelfId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peerGender, setPeerGender] = useState<SelfGender | null>(null);
  const [peerPresence, setPeerPresence] = useState<"unknown" | "online" | "offline">("unknown");
  const [exiting, setExiting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof client.channel> | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitInFlightRef = useRef(false);
  const roomEndedRef = useRef(false);
  const unloadBeaconSentRef = useRef(false);
  const [isAiRoom, setIsAiRoom] = useState(false);
  const isAiRoomRef = useRef(false);
  const messagesRef = useRef<MessageRow[]>([]);
  const replyQueueRef = useRef<string[]>([]);
  const flushLockRef = useRef(false);
  const answeredHumanIdsRef = useRef<Set<string>>(new Set());
  const openerDoneRef = useRef(false);
  const openerTimerRef = useRef<number | null>(null);
  const ghostSchedule = useRef(createGhostSchedule());
  const botPersonaRef = useRef<BotPersona | null>(null);
  const botTimingRef = useRef<BotApiBody["timing"]>({});
  const botSettingsRef = useRef<BotSettings>(loadBotSettings());

  const aiBusyRef = useRef(false);
  const skipEndingRef = useRef(false);

  const [hideBotUi, setHideBotUi] = useState(
    () => loadBotSettings().matchMode === "hidden_bots",
  );
  const [hideGenderFilters, setHideGenderFilters] = useState(
    () => loadBotSettings().hideGenderFilters,
  );

  const cancelOpener = useCallback(() => {
    if (openerTimerRef.current !== null) {
      window.clearTimeout(openerTimerRef.current);
      openerTimerRef.current = null;
    }
    openerDoneRef.current = true;
  }, []);

  const userHasSpoken = useCallback((snapshot?: MessageRow[]) => {
    const msgs = snapshot ?? messagesRef.current;
    const self = selfIdRef.current;
    if (!self) return msgs.some((m) => !isBotMessage(m));
    return msgs.some((m) => !isBotMessage(m) && m.user_id === self);
  }, []);

  useEffect(() => {
    selfIdRef.current = selfId;
  }, [selfId]);

  useEffect(() => {
    isAiRoomRef.current = isAiRoom;
  }, [isAiRoom]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const refresh = () => {
      botSettingsRef.current = loadBotSettings();
      setHideBotUi(botSettingsRef.current.matchMode === "hidden_bots");
      setHideGenderFilters(botSettingsRef.current.hideGenderFilters);
      if (isAiRoomRef.current && botPersonaRef.current) {
        const p = botPersonaRef.current;
        botPersonaRef.current = buildBotPersona(roomId, p.botGender, p.userGender, botSettingsRef.current);
      }
    };
    refresh();
    window.addEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
  }, [roomId]);

  useEffect(() => {
    openerDoneRef.current = false;
    if (openerTimerRef.current !== null) {
      window.clearTimeout(openerTimerRef.current);
      openerTimerRef.current = null;
    }
    answeredHumanIdsRef.current = new Set();
    replyQueueRef.current = [];
    flushLockRef.current = false;
    disarmGhostSchedule(ghostSchedule.current);
    botTimingRef.current = {};
    botPersonaRef.current = null;
    unloadBeaconSentRef.current = false;
    roomEndedRef.current = false;
    skipEndingRef.current = false;
  }, [roomId]);

  const endRoomBeacon = useCallback(() => {
    if (unloadBeaconSentRef.current) return;
    unloadBeaconSentRef.current = true;
    tabCloseFetch("/api/chat/end-room", { roomId });
    tabCloseFetch("/api/presence/leave");
  }, [roomId]);

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
      .select("id,user_a,user_b,user_a_gender,user_b_gender,is_ai_room,bot_gender,ended_at")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !room) {
      setPeerId(null);
      setPeerGender(null);
      setIsAiRoom(false);
      setError("This chat does not exist or you do not have access.");
      setLoading(false);
      return;
    }
    const isAi = Boolean(room.is_ai_room);
    setIsAiRoom(isAi);
    if (isAi) {
      const botG = (room.bot_gender ?? room.user_b_gender ?? "female") as SelfGender;
      const userG = (room.user_a_gender ?? "male") as SelfGender;
      botPersonaRef.current = buildBotPersona(roomId, botG, userG, botSettingsRef.current);
    } else {
      botPersonaRef.current = null;
    }
    if (room.user_a !== session.user.id && room.user_b !== session.user.id) {
      setPeerId(null);
      setPeerGender(null);
      setError("You are not a participant in this chat.");
      setLoading(false);
      return;
    }
    if (room.ended_at) {
      setPeerId(null);
      setPeerGender(null);
      router.replace("/match");
      return;
    }

    const meIsUserA = room.user_a === session.user.id;
    setPeerId(meIsUserA ? room.user_b : room.user_a);
    if (isAi && meIsUserA) {
      setPeerGender((room.user_b_gender as SelfGender | null) ?? (room.bot_gender as SelfGender | null) ?? null);
    } else {
      setPeerGender((meIsUserA ? room.user_b_gender : room.user_a_gender) ?? null);
    }

    const { data: msgs, error: msgErr } = await client
      .from("messages")
      .select("id,room_id,user_id,content,created_at,is_from_ai")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (msgErr) {
      setPeerId(null);
      setPeerGender(null);
      setIsAiRoom(false);
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

    const suffix =
      typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const channel = client
      .channel(`room:${roomId}:live:${suffix}`)
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
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const merged: MessageRow = {
              ...row,
              is_from_ai: Boolean(row.is_from_ai) || row.user_id == null,
            };
            return [...prev, merged];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const next = payload.new as { ended_at?: string | null };
          if (next.ended_at) {
            roomEndedRef.current = true;
            router.replace("/match");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        () => {
          roomEndedRef.current = true;
          router.replace("/match");
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, endRoomBeacon, ready, roomId, router]);

  useEffect(() => {
    if (!ready || !roomId) return;

    const onPageHide = () => endRoomBeacon();
    const onBeforeUnload = () => endRoomBeacon();

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [endRoomBeacon, ready, roomId]);

  useEffect(() => {
    if (!ready || !roomId) return;

    const bc = client
      .channel(`room:${roomId}:typing`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (isAiRoomRef.current) return;
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

  useEffect(() => {
    if (isAiRoom) {
      setPeerPresence("online");
    }
  }, [isAiRoom]);

  useEffect(() => {
    if (!ready || !roomId || !selfId || isAiRoom || !peerId) {
      return;
    }

    const applyPeerPresence = (ch: ReturnType<typeof client.channel>) => {
      const rows = ch.presenceState()[peerId];
      const online = Array.isArray(rows) && rows.length > 0;
      setPeerPresence(online ? "online" : "offline");
    };

    const presenceChannel = client.channel(`room:${roomId}:presence`, {
      config: { presence: { key: selfId } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => applyPeerPresence(presenceChannel))
      .on("presence", { event: "join" }, () => applyPeerPresence(presenceChannel))
      .on("presence", { event: "leave" }, () => applyPeerPresence(presenceChannel));

    presenceChannel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await presenceChannel.track({ in_chat: true, room_id: roomId });
    });

    return () => {
      setPeerPresence("unknown");
      void presenceChannel.untrack();
      void client.removeChannel(presenceChannel);
    };
  }, [client, ready, roomId, selfId, peerId, isAiRoom]);

  const sendTypingBroadcast = useCallback(
    async (active: boolean) => {
      if (isAiRoomRef.current) return;
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

  const endRoomAndGoMatch = useCallback(async (clearFilters: boolean) => {
    disarmGhostSchedule(ghostSchedule.current);
    if (exitInFlightRef.current) return;
    exitInFlightRef.current = true;
    setExiting(true);

    if (clearFilters) {
      localStorage.removeItem("banterbird:selfGender");
      localStorage.removeItem("banterbird:wantsGender");
    }

    const { error } = await client.rpc("end_active_room", { p_room_id: roomId });
    if (error) {
      setError(error.message);
      setExiting(false);
      exitInFlightRef.current = false;
      skipEndingRef.current = false;
      return;
    }

    // Fire-and-forget cleanup (room may already be deleted by end_active_room RPC).
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/api/chat/cleanup-room`;
      fetch(url, {
        method: "POST",
        body: JSON.stringify({ roomId }),
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => undefined);
    }
    roomEndedRef.current = true;
    router.replace("/match");
  }, [client, roomId, router]);

  const transcriptFromSnapshot = useCallback((snapshot: MessageRow[]) => {
    return snapshot.map((m) => ({
      role: (isBotMessage(m) ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));
  }, []);

  const finishSkipAndLeave = useCallback(async () => {
    skipEndingRef.current = true;
    disarmGhostSchedule(ghostSchedule.current);
    replyQueueRef.current = [];
    await endRoomAndGoMatch(false);
  }, [endRoomAndGoMatch]);

  const ghostCtx = useCallback(
    (botMessageId?: string | null) => {
      const s = botSettingsRef.current;
      return {
        schedule: ghostSchedule.current,
        getMessages: () => messagesRef.current,
        selfId: selfIdRef.current ?? "",
        client,
        roomId,
        setPeerTyping,
        onError: setError,
        endRoom: () => finishSkipAndLeave(),
        isActive: () => isAiRoomRef.current && !exitInFlightRef.current && !skipEndingRef.current,
        botMessageId,
        ghostPingMs: s.ghostPingMs,
        ghostSkipMs: s.ghostSkipMs,
      };
    },
    [client, roomId, finishSkipAndLeave],
  );

  const armGhostAfterBot = useCallback(
    (botMessageId?: string | null) => {
      const self = selfIdRef.current;
      if (!self || !isAiRoomRef.current || exitInFlightRef.current || skipEndingRef.current) return;

      armGhostSchedule({
        ...ghostCtx(botMessageId),
        selfId: self,
      });
    },
    [ghostCtx],
  );

  const flushReplyQueue = useCallback(async () => {
    if (flushLockRef.current) return;
    const targetId = replyQueueRef.current.shift();
    if (!targetId) return;
    flushLockRef.current = true;
    aiBusyRef.current = true;
    try {
      const snapshot = messagesRef.current;
      const idx = snapshot.findIndex((m) => m.id === targetId);
      if (idx < 0) return;
      const slice = snapshot.slice(0, idx + 1);
      const transcript = transcriptFromSnapshot(slice);
      const triggeringLen = slice[slice.length - 1]?.content.length ?? 0;

      const clientSkip = shouldClientSkipChat(
        transcript,
        botPersonaRef.current ?? undefined,
        botSettingsRef.current,
      );
      if (clientSkip.skip) {
        const outcome = await executeBotTurn({
          body: {
            action: "skip",
            parting: clientSkip.parting,
            timing: botTimingRef.current,
          },
          client,
          roomId,
          setPeerTyping,
          onError: setError,
          userMessageLen: triggeringLen,
        });
        if (outcome === "skip") {
          await finishSkipAndLeave();
        }
        return;
      }

      const res = await fetch("/api/chat/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          messages: transcript,
          botSettings: botSettingsRef.current,
        }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as BotApiBody;
      if (body.timing) botTimingRef.current = body.timing;

      const outcome = await executeBotTurn({
        body,
        client,
        roomId,
        setPeerTyping,
        onError: setError,
        userMessageLen: triggeringLen,
      });

      if (outcome === "skip") {
        await finishSkipAndLeave();
        return;
      }
      armGhostAfterBot(messagesRef.current[messagesRef.current.length - 1]?.id ?? null);
    } finally {
      flushLockRef.current = false;
      aiBusyRef.current = false;
      setPeerTyping(false);
      if (replyQueueRef.current.length > 0) {
        queueMicrotask(() => {
          void flushReplyQueue();
        });
      }
    }
  }, [client, roomId, transcriptFromSnapshot, armGhostAfterBot, finishSkipAndLeave]);

  useEffect(() => {
    if (!ready || !isAiRoom || loading) return;
    const openerDelay = resolveOpenerDelayMs(botSettingsRef.current);
    openerTimerRef.current = window.setTimeout(async () => {
      openerTimerRef.current = null;
      if (openerDoneRef.current) return;
      if (messagesRef.current.some((m) => isBotMessage(m))) return;
      if (userHasSpoken()) return;
      openerDoneRef.current = true;
      aiBusyRef.current = true;

      try {
        const res = await fetch("/api/chat/ai-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            messages: [] as { role: "user" | "assistant"; content: string }[],
            botSettings: botSettingsRef.current,
          }),
        });
        if (!res.ok) return;
        if (userHasSpoken()) return;
        const body = (await res.json()) as BotApiBody;
        if (body.timing) botTimingRef.current = body.timing;
        if (userHasSpoken()) return;

        const outcome = await executeBotTurn({
          body,
          client,
          roomId,
          setPeerTyping,
          onError: setError,
          isOpener: true,
        });
        if (outcome === "skip") {
          await finishSkipAndLeave();
          return;
        }
        armGhostAfterBot(messagesRef.current[messagesRef.current.length - 1]?.id ?? null);
      } finally {
        aiBusyRef.current = false;
        setPeerTyping(false);
      }
    }, openerDelay);
    return () => {
      if (openerTimerRef.current !== null) {
        window.clearTimeout(openerTimerRef.current);
        openerTimerRef.current = null;
      }
    };
  }, [ready, isAiRoom, loading, roomId, client, finishSkipAndLeave, armGhostAfterBot, userHasSpoken]);

  // Re-arm ghost when bot message lands (covers missed arms + page reload mid-wait).
  useEffect(() => {
    if (!ready || !isAiRoom || loading || !selfId || exitInFlightRef.current || skipEndingRef.current) return;
    if (aiBusyRef.current || flushLockRef.current) return;
    if (ghostSchedule.current.pingSentAt !== null || ghostSchedule.current.skipTimer !== null) return;

    const last = messages[messages.length - 1];
    if (!last || !isBotMessage(last)) return;

    const lastIdx = messages.findIndex((m) => m.id === last.id);
    const userReplied = messages
      .slice(lastIdx + 1)
      .some((m) => !isBotMessage(m) && m.user_id === selfId);
    if (userReplied) return;

    armGhostAfterBot(last.id);
  }, [messages, ready, isAiRoom, loading, selfId, armGhostAfterBot]);

  useEffect(() => {
    if (!ready || !isAiRoom || loading || !selfId) return;
    const last = messages[messages.length - 1];
    if (!last || isBotMessage(last) || last.user_id !== selfId) return;
    cancelOpener();
    disarmGhostSchedule(ghostSchedule.current);
    if (answeredHumanIdsRef.current.has(last.id)) return;
    answeredHumanIdsRef.current.add(last.id);
    replyQueueRef.current.push(last.id);
    void flushReplyQueue();
  }, [messages, ready, isAiRoom, loading, selfId, flushReplyQueue, cancelOpener]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isAiRoomRef.current) cancelOpener();
      disarmGhostSchedule(ghostSchedule.current);
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
    [client, roomId, cancelOpener],
  );

  const displayAsHuman = isAiRoom && hideBotUi;
  const showPeerGender = !hideGenderFilters;

  if (loading || !selfId) {
    return <PageLoader label="Opening your chat…" />;
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-20 text-center">
        <MessageCircle className="h-12 w-12 text-navy-400" />
        <p className="text-navy-700 dark:text-navy-200">{error}</p>
        <button
          type="button"
          onClick={() => void router.replace("/match")}
          className="rounded-2xl bg-navy-900 px-6 py-3 text-sm font-semibold text-white dark:bg-navy-100 dark:text-navy-950"
        >
          Back to matching
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-navy-200/60 px-3 py-3 dark:border-white/10 sm:px-4">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={exiting} // This is the "Cancel" button
          onClick={() => void endRoomAndGoMatch(true)}
          className="inline-flex items-center gap-2 rounded-2xl px-2 py-2 text-sm font-medium text-navy-700 transition hover:bg-navy-900/5 disabled:opacity-50 dark:text-navy-200 dark:hover:bg-white/5"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Match</span>
        </motion.button>
        <div className="min-w-0 flex-1 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-navy-950 dark:text-navy-50">Anonymous chat</p>
            {!displayAsHuman && isAiRoom ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 dark:text-violet-100 sm:text-[11px]">
                <Bot className="h-3 w-3" aria-hidden />
                Practice bot
              </span>
            ) : null}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${
                peerPresence === "online"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : peerPresence === "offline"
                    ? "border-navy-200/70 bg-white/50 text-navy-500 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-400"
                    : "border-navy-200/60 bg-white/40 text-navy-400 dark:border-white/10 dark:bg-navy-900/30 dark:text-navy-500"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  peerPresence === "online"
                    ? "animate-pulse bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.45)]"
                    : peerPresence === "offline"
                      ? "bg-navy-300 dark:bg-navy-600"
                      : "bg-navy-200 dark:bg-navy-700"
                }`}
                aria-hidden
              />
              {peerPresence === "unknown" ? "…" : peerPresence === "online" ? "Online" : "Offline"}
            </span>
            {showPeerGender ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-navy-200/70 bg-white/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-600 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-300 sm:text-[11px]">
                {peerGender === "male" ? (
                  <Mars className="h-3 w-3 text-blue-500" aria-hidden />
                ) : peerGender === "female" ? (
                  <Venus className="h-3 w-3 text-pink-500" aria-hidden />
                ) : (
                  <span className="inline-block h-2 w-2 rounded-full bg-navy-300 dark:bg-navy-600" aria-hidden />
                )}
                {isAiRoom && !hideBotUi
                  ? "Bot persona"
                  : peerGender === "male"
                    ? "Man"
                    : peerGender === "female"
                      ? "Woman"
                      : "Unknown"}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-navy-500 dark:text-navy-400">
            You are both strangers — stay kind.
          </p>
        </div>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={exiting} // This is the "Skip" button
          onClick={() => void endRoomAndGoMatch(false)}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-navy-900 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 dark:bg-navy-100 dark:text-navy-950"
        >
          <SkipForward className="h-3.5 w-3.5" aria-hidden />
          Skip
        </motion.button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !peerTyping ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            {loading ? <PageLoader label="Opening your chat..." /> : <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-3xl border border-navy-200/60 bg-white/50 px-6 py-8 dark:border-white/10 dark:bg-navy-900/30"
            >
              <p className="text-sm font-medium text-navy-800 dark:text-navy-100">No messages yet</p>
              <p className="mt-2 max-w-xs text-xs text-navy-500 dark:text-navy-400">
                Say hi — your match is on the other side of this glassy little bubble.
              </p>
            </motion.div>}
          </div>
        ) : (
          <MessageList
            messages={messages}
            selfId={selfId}
            peerTyping={peerTyping}
            peerIsBot={isAiRoom && !hideBotUi}
            peerLabel="Stranger"
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 space-y-1 border-t border-navy-200/50 bg-[var(--page-bg)]/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:border-white/10">
        <ChatComposer
          onSend={sendMessage}
          onTypingChange={(typing) => void sendTypingBroadcast(typing)}
        />
      </div>
    </div>
  );
}
