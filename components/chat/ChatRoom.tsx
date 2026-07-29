"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bot, Flag, Mars, MessageCircle, SkipForward, Venus } from "lucide-react";
import { useSupabase } from "@/app/providers";
import { executeBotTurn, type BotApiBody } from "@/components/chat/bot-turn";
import {
  armGhostSchedule,
  createGhostSchedule,
  disarmGhostSchedule,
  extendGhostPingDeadline,
  refreshGhostAfterForeground,
  isBotMessage,
  type GhostScheduleContext,
} from "@/components/chat/ghost-watch";
import { shouldClientSkipChat } from "@/lib/ai-practice-bot/client-skip";
import { buildBotPersona, type BotPersona } from "@/lib/ai-practice-bot/persona";
import {
  BOT_SETTINGS_CHANGED_EVENT,
  resolveOpenerDelayMs,
  type BotSettings,
} from "@/lib/ops/bot-settings";
import { useGlobalBotSettings } from "@/lib/ops/bot-settings-provider";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { MessageList } from "@/components/chat/MessageList";
import { PageLoader } from "@/components/ui/Loading";
import type { MessageRow, SelfGender } from "@/lib/types/chat";
import { tabCloseFetch } from "@/lib/presence/tab-close-fetch";
import { getDeviceId } from "@/lib/moderation/device-id";
import { blockUserForSession } from "@/lib/moderation/session-block";
import { ConnectionSignal } from "@/components/chat/ConnectionSignal";
import { ReportUserDialog } from "@/components/chat/ReportUserDialog";
import { FriendRequestButton } from "@/components/chat/FriendRequestButton";
import { checkMatchAccess, rejectBlockedRoom, shouldAcceptRoom } from "@/lib/match/room-guard";
import { useKeyboardInset } from "@/lib/hooks/use-keyboard-inset";
import { useInactivityTimeout } from "@/lib/hooks/use-inactivity-timeout";
import {
  recordInactivitySkip,
  resetInactivityStrikes,
} from "@/lib/moderation/inactivity-strikes";
import { networkErrorMessage } from "@/lib/network-error";
import { uploadChatImage, encodeImageMessage } from "@/lib/chat/image-upload";
import { useAccount } from "@/lib/account/context";

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
  const messagesScrollRef = useRef<HTMLDivElement>(null);
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
  const globalBotSettings = useGlobalBotSettings();
  const botSettingsRef = useRef<BotSettings>(globalBotSettings);

  const aiBusyRef = useRef(false);
  const skipEndingRef = useRef(false);
  const abortBotTurnRef = useRef(false);
  const flushReplyQueueRef = useRef<() => void>(() => {});
  const ghostCtxRef = useRef<(botMessageId?: string | null) => GhostScheduleContext>(() => ({
    schedule: ghostSchedule.current,
    getMessages: () => messagesRef.current,
    selfId: "",
    client,
    roomId,
    setPeerTyping,
    onError: setError,
    endRoom: async () => {},
    isActive: () => false,
  }));

  const [hideBotUi, setHideBotUi] = useState(globalBotSettings.matchMode === "hidden_bots");
  const [hideGenderFilters, setHideGenderFilters] = useState(globalBotSettings.hideGenderFilters);
  const [showReport, setShowReport] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const skipConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardInset = useKeyboardInset();
  const peerTypingRef = useRef(false);
  // Dynamic peer username - updated when peer accepts our friend request
  const [peerUsername, setPeerUsername] = useState<string | null>(null);
  const { state } = useAccount();

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
      botSettingsRef.current = globalBotSettings;
      setHideBotUi(globalBotSettings.matchMode === "hidden_bots");
      setHideGenderFilters(globalBotSettings.hideGenderFilters);
      if (isAiRoomRef.current && botPersonaRef.current) {
        const p = botPersonaRef.current;
        botPersonaRef.current = buildBotPersona(roomId, p.botGender, p.userGender, botSettingsRef.current);
      }
    };
    refresh();
    window.addEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(BOT_SETTINGS_CHANGED_EVENT, refresh);
  }, [roomId, globalBotSettings]);

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
    setSkipConfirm(false);
    if (skipConfirmTimer.current !== null) {
      clearTimeout(skipConfirmTimer.current);
      skipConfirmTimer.current = null;
    }
  }, [roomId]);

  const endRoomBeacon = useCallback(() => {
    if (unloadBeaconSentRef.current) return;
    // Don't end the room if the user is doing an OAuth redirect -
    // they're coming back to this chat after signing in.
    if (typeof window !== "undefined" && sessionStorage.getItem("banterbird:oauth_redirect") === "1") return;
    unloadBeaconSentRef.current = true;
    tabCloseFetch("/api/chat/end-room", { roomId });
    tabCloseFetch("/api/presence/leave");
  }, [roomId]);

  const scrollToBottom = useCallback((instant = false) => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: instant ? "auto" : "smooth",
    });
  }, []);

  const shouldAbortBotTurn = useCallback(() => abortBotTurnRef.current, []);

  useEffect(() => {
    peerTypingRef.current = peerTyping;
  }, [peerTyping]);

  useEffect(() => {
    scrollToBottom(true);
  }, [keyboardInset, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, peerTyping, scrollToBottom]);

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

    // Retry fetching the room a few times with backoff to handle read-replica
    // replication lag. The try_match RPC writes to the primary and both clients
    // navigate immediately — the row may not yet be visible on the replica when
    // the first SELECT fires.
    let room: {
      id: string;
      user_a: string;
      user_b: string | null;
      user_a_gender: string | null;
      user_b_gender: string | null;
      is_ai_room: boolean;
      bot_gender: string | null;
      ended_at: string | null;
    } | null = null;
    let roomErr: unknown = null;
    const RETRY_DELAYS = [0, 300, 700, 1500, 3000];
    for (const delay of RETRY_DELAYS) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const result = await client
        .from("rooms")
        .select("id,user_a,user_b,user_a_gender,user_b_gender,is_ai_room,bot_gender,ended_at")
        .eq("id", roomId)
        .maybeSingle();
      roomErr = result.error;
      room = result.data as typeof room;
      if (!result.error && result.data) break;
    }

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
      router.replace("/");
      return;
    }

    const access = await checkMatchAccess(client);
    if (!access.allowed) {
      // Only end the room for hard moderation blocks - soft/auth errors must not kill a fresh match.
      if (access.reason === "blocked") {
        await client.rpc("end_active_room", { p_room_id: roomId });
        router.replace("/");
        return;
      }
      // unauthorized/error: keep the room; user can refresh. Avoid match flicker.
    }

    const accept = await shouldAcceptRoom(client, roomId, session.user.id);
    if (!accept) {
      await rejectBlockedRoom(client, roomId);
      router.replace("/");
      // Delay before re-matching so blocked list propagates on both sides
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("banterbird:start-matching"));
      }, 1500 + Math.random() * 1000);
      return;
    }

    const meIsUserA = room.user_a === session.user.id;

    const msgsPromise = client
      .from("messages")
      .select("id,room_id,user_id,content,created_at,is_from_ai")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    setPeerId(meIsUserA ? room.user_b : room.user_a);
    if (isAi && meIsUserA) {
      setPeerGender((room.user_b_gender as SelfGender | null) ?? (room.bot_gender as SelfGender | null) ?? null);
    } else {
      setPeerGender((meIsUserA ? room.user_b_gender : room.user_a_gender) ?? null);
    }

    const { data: msgs, error: msgErr } = await msgsPromise;

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
            // Remove optimistic message with same content if it exists
            const optimisticIndex = prev.findIndex(
              (m) => m.id.startsWith("temp-") && m.content === row.content && m.user_id === row.user_id,
            );
            if (optimisticIndex >= 0) {
              const clientKey = prev[optimisticIndex]!.clientKey ?? prev[optimisticIndex]!.id;
              const updated = [...prev];
              updated[optimisticIndex] = {
                ...row,
                clientKey,
                is_from_ai: Boolean(row.is_from_ai) || row.user_id == null,
              };
              return updated;
            }
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
            router.replace("/");
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
          router.replace("/");
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
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      if (isAiRoomRef.current && ghostSchedule.current.armed && selfIdRef.current) {
        refreshGhostAfterForeground({
          ...ghostCtxRef.current(ghostSchedule.current.armedForBotMessageId),
          selfId: selfIdRef.current,
        });
      }
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [endRoomBeacon, ready, roomId, cancelOpener]);

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

    const topicName = `room:${roomId}:presence`;
    for (const existing of client.getChannels()) {
      const topic = existing.topic ?? "";
      if (topic === `realtime:${topicName}` || topic.endsWith(`:${topicName}`)) {
        void client.removeChannel(existing);
      }
    }

    const presenceChannel = client.channel(topicName, {
      config: { presence: { key: selfId } },
    });

    // Presence callbacks must be registered before subscribe().
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
    (active: boolean) => {
      if (isAiRoomRef.current) return;
      const ch = typingChannelRef.current;
      const uid = selfIdRef.current;
      if (!ch || !uid) return;
      void ch.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: uid, active },
      });
    },
    [],
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
    router.replace("/");
  }, [client, roomId, router]);

  const leaveManually = useCallback(
    async (clearFilters: boolean, blockPeer = false) => {
      resetInactivityStrikes();
      if (peerId && !isAiRoom) {
        if (blockPeer) {
          blockUserForSession(peerId);
          // Also register server-side so try_match excludes this pair for both users
          void fetch("/api/match/block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockedId: peerId }),
          });
        }
      }
      await endRoomAndGoMatch(clearFilters);
    },
    [endRoomAndGoMatch, peerId, isAiRoom],
  );

  const leaveForInactivity = useCallback(async () => {
    recordInactivitySkip();
    if (peerId && !isAiRoom) {
      blockUserForSession(peerId);
      void fetch("/api/match/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedId: peerId }),
      });
    }
    await endRoomAndGoMatch(false);
  }, [endRoomAndGoMatch, peerId, isAiRoom]);

  const inactive = !loading && !error && !exiting && !showReport;
  const { bumpActivity } = useInactivityTimeout(
    () => void leaveForInactivity(),
    inactive,
  );

  useEffect(() => {
    bumpActivity();
  }, [messages.length, peerTyping, bumpActivity]);

  const transcriptFromSnapshot = useCallback((snapshot: MessageRow[]) => {
    return snapshot.map((m) => ({
      role: (isBotMessage(m) ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));
  }, []);

  const finishBotSkipAndLeave = useCallback(async () => {
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
        endRoom: () => finishBotSkipAndLeave(),
        isActive: () => isAiRoomRef.current && !exitInFlightRef.current && !skipEndingRef.current,
        botMessageId,
        ghostPingMs: s.ghostPingMs,
        ghostSkipMs: s.ghostSkipMs,
      };
    },
    [client, roomId, finishBotSkipAndLeave],
  );

  useEffect(() => {
    ghostCtxRef.current = ghostCtx;
  }, [ghostCtx]);

  const armGhostAfterBot = useCallback(
    (botMessageId?: string | null) => {
      const self = selfIdRef.current;
      if (!self || !isAiRoomRef.current || exitInFlightRef.current || skipEndingRef.current) return;
      if (aiBusyRef.current || flushLockRef.current || peerTypingRef.current) return;

      const msgs = messagesRef.current;
      const last = msgs[msgs.length - 1];
      if (!last || !isBotMessage(last)) return;
      if (last.id.startsWith("temp-")) return;

      armGhostSchedule({
        ...ghostCtx(botMessageId ?? last.id),
        selfId: self,
        botMessageId: botMessageId ?? last.id,
      });
    },
    [ghostCtx],
  );

  const flushReplyQueue = useCallback(async () => {
    if (flushLockRef.current) return;
    const targetId = replyQueueRef.current.at(-1);
    replyQueueRef.current = [];
    if (!targetId) return;
    flushLockRef.current = true;
    aiBusyRef.current = true;
    abortBotTurnRef.current = false;
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
          shouldAbort: shouldAbortBotTurn,
        });
        if (outcome === "aborted") {
          replyQueueRef.current = [targetId];
          return;
        }
        if (outcome === "skip") {
          await finishBotSkipAndLeave();
        }
        return;
      }

      const res = await fetch("/api/chat/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          messages: transcript,
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
        shouldAbort: shouldAbortBotTurn,
      });

      if (outcome === "aborted") {
        replyQueueRef.current = [targetId];
        return;
      }
      if (outcome === "skip") {
        await finishBotSkipAndLeave();
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
  }, [client, roomId, transcriptFromSnapshot, armGhostAfterBot, finishBotSkipAndLeave, shouldAbortBotTurn]);

  useEffect(() => {
    flushReplyQueueRef.current = () => {
      void flushReplyQueue();
    };
  }, [flushReplyQueue]);

  useEffect(() => {
    if (!ready || !isAiRoom || loading) return;
    if (openerDoneRef.current || openerTimerRef.current !== null) return;
    if (messagesRef.current.some((m) => isBotMessage(m))) return;
    const openerDelay = resolveOpenerDelayMs(botSettingsRef.current);
    openerTimerRef.current = window.setTimeout(async () => {
      openerTimerRef.current = null;
      if (openerDoneRef.current) return;
      if (messagesRef.current.some((m) => isBotMessage(m))) return;
      if (userHasSpoken()) return;
      openerDoneRef.current = true;
      aiBusyRef.current = true;
      abortBotTurnRef.current = false;

      try {
        const res = await fetch("/api/chat/ai-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            messages: [] as { role: "user" | "assistant"; content: string }[],
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
          shouldAbort: shouldAbortBotTurn,
        });
        if (outcome === "aborted") {
          openerDoneRef.current = false;
          return;
        }
        if (outcome === "skip") {
          await finishBotSkipAndLeave();
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
  }, [ready, isAiRoom, loading, roomId, client, finishBotSkipAndLeave, armGhostAfterBot, userHasSpoken, shouldAbortBotTurn]);

  // Re-arm ghost when bot message lands (covers missed arms + page reload mid-wait).
  useEffect(() => {
    if (!ready || !isAiRoom || loading || !selfId || exitInFlightRef.current || skipEndingRef.current) return;
    if (aiBusyRef.current || flushLockRef.current || peerTyping) return;
    if (ghostSchedule.current.armed || ghostSchedule.current.pingSentAt !== null) return;

    const last = messages[messages.length - 1];
    if (!last || !isBotMessage(last) || last.id.startsWith("temp-")) return;

    const lastIdx = messages.findIndex((m) => m.id === last.id);
    const userReplied = messages
      .slice(lastIdx + 1)
      .some((m) => !isBotMessage(m) && m.user_id === selfId);
    if (userReplied) return;

    armGhostAfterBot(last.id);
  }, [messages, ready, isAiRoom, loading, selfId, peerTyping, armGhostAfterBot]);

  const handleComposerTyping = useCallback(
    (active: boolean) => {
      sendTypingBroadcast(active);
      if (active) scrollToBottom(true);
      if (!isAiRoomRef.current || !active) return;
      extendGhostPingDeadline(ghostCtxRef.current(ghostSchedule.current.armedForBotMessageId));
    },
    [sendTypingBroadcast, scrollToBottom],
  );

  useEffect(() => {
    if (!ready || !isAiRoom || loading || !selfId) return;
    const last = messages[messages.length - 1];
    if (!last || isBotMessage(last) || last.user_id !== selfId) return;
    cancelOpener();
    disarmGhostSchedule(ghostSchedule.current);
    if (answeredHumanIdsRef.current.has(last.id)) return;
    if (last.id.startsWith("temp-")) return;
    answeredHumanIdsRef.current.add(last.id);
    replyQueueRef.current = [last.id];
    void flushReplyQueue();
  }, [messages, ready, isAiRoom, loading, selfId, flushReplyQueue, cancelOpener]);

  const sendMessage = useCallback(
    async (text: string) => {
      resetInactivityStrikes();
      if (isAiRoomRef.current) cancelOpener();
      disarmGhostSchedule(ghostSchedule.current);

      // Optimistic UI: show message immediately
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const clientKey = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticMessage: MessageRow = {
        id: tempId,
        clientKey,
        room_id: roomId,
        user_id: selfIdRef.current!,
        content: text,
        created_at: new Date().toISOString(),
        is_from_ai: false,
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const res = await fetch("/api/chat/send-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            content: text,
            deviceId: getDeviceId(),
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
          // Remove optimistic message on error
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          if (res.status === 403) {
            router.replace("/");
            return;
          }
          if (res.status === 429) {
            setError(j.error ?? "Slow down. Messages sent too quickly.");
            if (j.reason === "rate_limit" || j.reason === "burst_limit") {
              router.replace("/");
            }
            return;
          }
          setError(j.error ?? "Could not send message");
        }
        // Optimistic message will be replaced by real message via realtime subscription
      } catch (err) {
        // Remove optimistic message on network error
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError(networkErrorMessage(err));
      }
    },
    [roomId, cancelOpener, router],
  );

  // ── Helper: persist a system message to the DB ─────────────
  // This ensures both users see it and it survives refresh.
  const sendSystemMessage = useCallback(async (text: string) => {
    await fetch("/api/chat/system-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, text }),
    });
    // The message arrives via the existing realtime subscription — no need
    // to call setMessages directly.
  }, [roomId]);

  // ── Peer username resolution ────────────────────────────────
  // Only show the peer's username if they are a CURRENT friend.
  // Former friends or strangers always show as "Stranger".
  useEffect(() => {
    if (!peerId || isAiRoom || !ready) return;
    let cancelled = false;
    void (async () => {
      // Check current friendship status first
      const { data: friendship } = await client
        .from("friendships")
        .select("friend_id")
        .eq("user_id", selfId!)
        .eq("friend_id", peerId)
        .maybeSingle();

      if (cancelled) return;
      if (!friendship) {
        // Not friends — keep as Stranger
        setPeerUsername(null);
        return;
      }
      // Current friend — fetch their username
      const { data } = await client
        .from("profiles")
        .select("username")
        .eq("id", peerId)
        .maybeSingle();
      if (!cancelled && data?.username) setPeerUsername(data.username);
    })();
    return () => { cancelled = true; };
  }, [peerId, isAiRoom, ready, client, selfId]);

  // ── Friend request notifications in chat ────────────────────
  // Listen for friend_requests where to_id = selfId AND from_id = peerId.
  // When one arrives inject a system message so the user sees it in chat.
  useEffect(() => {
    if (!peerId || !selfId || isAiRoom) return;
    const channel = client
      .channel(`chat:fr:${roomId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "friend_requests",
        filter: `to_id=eq.${selfId}`,
      }, (payload) => {
        const row = payload.new as { from_id: string; to_id: string };
        if (row.from_id !== peerId) return;
        const isAnon = state.status === "anonymous" || state.status === "loading";
        const sysText = isAnon
          ? `${peerUsername ?? "Stranger"} sent you a friend request - sign in to accept it`
          : `${peerUsername ?? "Stranger"} sent you a friend request`;
        void sendSystemMessage(sysText);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "friend_requests",
        filter: `from_id=eq.${selfId}`,
      }, async (payload) => {
        // Peer accepted our request - fetch their username and update label
        const row = payload.new as { to_id: string; status: string };
        if (row.to_id !== peerId || row.status !== "accepted") return;
        const { data } = await client
          .from("profiles")
          .select("username")
          .eq("id", peerId)
          .maybeSingle();
        if (data?.username) {
          setPeerUsername(data.username);
          void sendSystemMessage(`${data.username} accepted your friend request`);
        }
      })
      // We accepted their request — friendships row inserted for us
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "friendships",
        filter: `user_id=eq.${selfId}`,
      }, async (payload) => {
        const row = payload.new as { friend_id: string };
        if (row.friend_id !== peerId) return;
        // We just became friends with this person mid-chat — update label
        const { data } = await client
          .from("profiles")
          .select("username")
          .eq("id", peerId)
          .maybeSingle();
        if (data?.username) {
          setPeerUsername(data.username);
          void sendSystemMessage(`You are now friends with ${data.username}`);
        }
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [peerId, selfId, isAiRoom, roomId, client, peerUsername, sendSystemMessage, state.status]);

  // ── Image send handler ──────────────────────────────────────
  const sendImage = useCallback(async (file: File) => {
    if (!selfId) return;
    const result = await uploadChatImage(file, client, selfId);
    if (!result.ok) { setError(result.error); return; }
    await sendMessage(encodeImageMessage(result.url));
  }, [selfId, client, sendMessage]);

  const displayAsHuman = isAiRoom && hideBotUi;
  const showPeerGender = !hideGenderFilters;
  const peerLabel = peerUsername ?? "Stranger";

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
          onClick={() => void router.replace("/")}
          className="rounded-2xl bg-navy-900 px-6 py-3 text-sm font-semibold text-white dark:bg-navy-100 dark:text-navy-950"
        >
          Back to matching
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-navy-200/60 px-3 py-2.5 dark:border-white/10 sm:gap-2 sm:px-4">
        {/* Left: back button */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={exiting}
          onClick={() => void leaveManually(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-2 py-2 text-sm font-medium text-navy-800 transition hover:bg-navy-900/5 disabled:opacity-50 dark:text-navy-200 dark:hover:bg-white/5"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Match</span>
        </motion.button>
        <div className="min-w-0 flex-1 text-center">
          <p className="hidden text-sm font-semibold text-navy-950 sm:block dark:text-navy-50">
            {peerLabel === "Stranger" ? "Anonymous chat" : peerLabel}
          </p>
          <div className="flex flex-nowrap items-center justify-center gap-1 overflow-x-auto px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-1 sm:gap-1.5 [&::-webkit-scrollbar]:hidden">
            {!displayAsHuman && isAiRoom ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap text-violet-900 dark:text-violet-100 sm:px-2 sm:text-[11px]">
                <Bot className="h-3 w-3 shrink-0" aria-hidden />
                <span className="sm:hidden">Bot</span>
                <span className="hidden sm:inline">Practice bot</span>
              </span>
            ) : null}
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap sm:px-2 sm:text-[11px] ${
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
            <ConnectionSignal />
            {showPeerGender ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-navy-200/70 bg-white/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap text-navy-600 dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-300 sm:px-2 sm:text-[11px]"
                title={
                  isAiRoom && !hideBotUi
                    ? "Bot persona"
                    : peerGender === "male"
                      ? "Man"
                      : peerGender === "female"
                        ? "Woman"
                        : "Unknown"
                }
              >
                {peerGender === "male" ? (
                  <Mars className="h-3 w-3 shrink-0 text-blue-500" aria-hidden />
                ) : peerGender === "female" ? (
                  <Venus className="h-3 w-3 shrink-0 text-pink-500" aria-hidden />
                ) : (
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-navy-300 dark:bg-navy-600" aria-hidden />
                )}
                <span className="hidden sm:inline">
                  {isAiRoom && !hideBotUi
                    ? "Bot persona"
                    : peerGender === "male"
                      ? "Man"
                      : peerGender === "female"
                        ? "Woman"
                        : "Unknown"}
                </span>
              </span>
            ) : null}
          </div>
          <p className="mt-1 hidden text-xs text-navy-600 sm:block dark:text-navy-400">
            {peerLabel === "Stranger" ? "You are both strangers. Stay kind." : `Chatting with ${peerLabel}`}
          </p>
        </div>
        {/* Right: action buttons */}
        <div className="flex shrink-0 items-center gap-1.5">
          <FriendRequestButton peerId={peerId} isAiRoom={isAiRoom} hideBotUi={hideBotUi} />
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={exiting}
            onClick={() => setShowReport(true)}
            className="inline-flex items-center gap-1 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50 dark:text-rose-200"
            aria-label="Report user"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Report</span>
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={exiting}
            onClick={() => {
              if (!skipConfirm) {
                setSkipConfirm(true);
                if (skipConfirmTimer.current !== null) clearTimeout(skipConfirmTimer.current);
                skipConfirmTimer.current = setTimeout(() => {
                  setSkipConfirm(false);
                  skipConfirmTimer.current = null;
                }, 3000);
              } else {
                if (skipConfirmTimer.current !== null) {
                  clearTimeout(skipConfirmTimer.current);
                  skipConfirmTimer.current = null;
                }
                setSkipConfirm(false);
                void leaveManually(false, true);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 ${
              skipConfirm
                ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-navy-950"
                : "bg-navy-900 text-white dark:bg-navy-100 dark:text-navy-950"
            }`}
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
            {skipConfirm ? "Sure?" : "Skip"}
          </motion.button>
        </div>
      </div>

      {showReport ? (
        <ReportUserDialog
          roomId={roomId}
          peerId={peerId}
          isAiRoom={isAiRoom}
          messages={messages}
          selfId={selfId}
          onReported={() => {
            setShowReport(false);
            void leaveManually(false, true);
          }}
          onClose={() => setShowReport(false)}
        />
      ) : null}

      <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !peerTyping ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            {loading ? <PageLoader label="Opening your chat..." /> : <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-3xl border border-navy-200/60 bg-white/50 px-6 py-8 dark:border-white/10 dark:bg-navy-900/30"
            >
              <p className="text-sm font-medium text-navy-900 dark:text-navy-100">No messages yet</p>
              <p className="mt-2 max-w-xs text-xs text-navy-600 dark:text-navy-400">
                Say hi. Your match is on the other side of this glassy little bubble.
              </p>
            </motion.div>}
          </div>
        ) : (
          <MessageList
            messages={messages}
            selfId={selfId}
            peerTyping={peerTyping}
            peerIsBot={isAiRoom && !hideBotUi}
            peerLabel={peerLabel}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-navy-200/50 bg-[var(--page-bg)]/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:border-white/10">
        <ChatComposer
          onSend={sendMessage}
          onSendImage={sendImage}
          onTypingChange={handleComposerTyping}
          onFocus={() => scrollToBottom(true)}
        />
      </div>
    </div>
  );
}
