import type { SupabaseClient } from "@supabase/supabase-js";
import { pickGhostPing, pickGhostSkipParting } from "@/lib/ai-practice-bot/memory";
import { runHumanlikeTyping, typingDurationForReply } from "@/components/chat/typing";

export const GHOST_PING_MS = 10_000;
export const GHOST_SKIP_MS = 6_000;

export type GhostMessage = {
  id: string;
  is_from_ai?: boolean;
  user_id?: string | null;
};

/** Bot rows use null user_id (and usually is_from_ai). */
export function isBotMessage(m: GhostMessage): boolean {
  return Boolean(m.is_from_ai) || m.user_id == null;
}

export type GhostSchedule = {
  pingTimer: number | null;
  skipTimer: number | null;
  userMessageCountAtArm: number;
  armed: boolean;
  armedForBotMessageId: string | null;
  pingSentAt: number | null;
  /** Wall-clock ms when the ping should fire (survives background tab throttle). */
  pingDeadline: number | null;
  skipDeadline: number | null;
};

export function createGhostSchedule(): GhostSchedule {
  return {
    pingTimer: null,
    skipTimer: null,
    userMessageCountAtArm: 0,
    armed: false,
    armedForBotMessageId: null,
    pingSentAt: null,
    pingDeadline: null,
    skipDeadline: null,
  };
}

export function disarmGhostSchedule(schedule: GhostSchedule) {
  if (schedule.pingTimer) clearTimeout(schedule.pingTimer);
  if (schedule.skipTimer) clearTimeout(schedule.skipTimer);
  schedule.pingTimer = null;
  schedule.skipTimer = null;
  schedule.armed = false;
  schedule.armedForBotMessageId = null;
  schedule.pingSentAt = null;
  schedule.pingDeadline = null;
  schedule.skipDeadline = null;
}

/** Clear timers but keep armed state and deadlines (tab backgrounded). */
export function pauseGhostSchedule(schedule: GhostSchedule) {
  if (schedule.pingTimer) clearTimeout(schedule.pingTimer);
  if (schedule.skipTimer) clearTimeout(schedule.skipTimer);
  schedule.pingTimer = null;
  schedule.skipTimer = null;
}

function countUserMessages(messages: GhostMessage[], selfId: string): number {
  return messages.filter((m) => !isBotMessage(m) && m.user_id === selfId).length;
}

async function deliverGhostLine(
  client: SupabaseClient,
  roomId: string,
  line: string,
  setPeerTyping: (v: boolean) => void,
) {
  await runHumanlikeTyping(setPeerTyping, typingDurationForReply(line), line.length);
  const { error } = await client.rpc("insert_ai_chat_message", {
    p_room_id: roomId,
    p_content: line,
  });
  if (error) throw new Error(error.message);
}

export type GhostScheduleContext = {
  schedule: GhostSchedule;
  getMessages: () => GhostMessage[];
  selfId: string;
  client: SupabaseClient;
  roomId: string;
  setPeerTyping: (v: boolean) => void;
  onError: (msg: string) => void;
  endRoom: () => Promise<void>;
  isActive: () => boolean;
  botMessageId?: string | null;
  ghostPingMs?: number;
  ghostSkipMs?: number;
};

/** Schedule fn at a wall-clock deadline; pauses while the tab is hidden. */
function scheduleAtDeadline(
  deadlineMs: number,
  isActive: () => boolean,
  onFire: () => void,
): number | null {
  let handle: number | null = null;
  const tick = () => {
    if (!isActive()) return;
    if (document.visibilityState === "hidden") {
      const onVisible = () => {
        document.removeEventListener("visibilitychange", onVisible);
        tick();
      };
      document.addEventListener("visibilitychange", onVisible);
      return;
    }
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) {
      onFire();
      return;
    }
    handle = window.setTimeout(tick, Math.min(remaining, 800));
  };
  tick();
  return handle;
}

/**
 * Arm ghost timers when the bot finishes a turn. Fires ping at 10s and skip 6s later
 * unless the user sends a message in the meantime.
 */
export function armGhostSchedule(ctx: GhostScheduleContext) {
  if (!ctx.isActive()) return;

  const ghostPingMs = ctx.ghostPingMs ?? GHOST_PING_MS;
  const ghostSkipMs = ctx.ghostSkipMs ?? GHOST_SKIP_MS;

  const botId = ctx.botMessageId ?? null;
  if (botId && ctx.schedule.armed && ctx.schedule.armedForBotMessageId === botId) {
    return;
  }

  if (ctx.schedule.pingSentAt !== null || ctx.schedule.skipTimer !== null) {
    return;
  }

  disarmGhostSchedule(ctx.schedule);
  if (!ctx.isActive()) return;

  ctx.schedule.armedForBotMessageId = botId;
  ctx.schedule.userMessageCountAtArm = countUserMessages(ctx.getMessages(), ctx.selfId);
  ctx.schedule.armed = true;
  ctx.schedule.pingDeadline = Date.now() + ghostPingMs;

  const firePing = () => {
    if (!ctx.isActive() || !ctx.schedule.armed) return;
    if (countUserMessages(ctx.getMessages(), ctx.selfId) > ctx.schedule.userMessageCountAtArm) {
      disarmGhostSchedule(ctx.schedule);
      return;
    }

    ctx.schedule.pingSentAt = Date.now();
    ctx.schedule.pingDeadline = null;
    ctx.schedule.skipDeadline = Date.now() + ghostSkipMs;

    void (async () => {
      try {
        await deliverGhostLine(ctx.client, ctx.roomId, pickGhostPing(), ctx.setPeerTyping);
      } catch (e) {
        ctx.onError(e instanceof Error ? e.message : "Ghost ping failed");
        disarmGhostSchedule(ctx.schedule);
        return;
      } finally {
        ctx.setPeerTyping(false);
      }

      if (!ctx.isActive() || !ctx.schedule.armed) return;
      if (countUserMessages(ctx.getMessages(), ctx.selfId) > ctx.schedule.userMessageCountAtArm) {
        disarmGhostSchedule(ctx.schedule);
        return;
      }

      const skipDeadline = ctx.schedule.skipDeadline ?? Date.now() + ghostSkipMs;
      ctx.schedule.skipTimer = scheduleAtDeadline(skipDeadline, ctx.isActive, () => {
        if (!ctx.isActive() || !ctx.schedule.armed) return;
        if (countUserMessages(ctx.getMessages(), ctx.selfId) > ctx.schedule.userMessageCountAtArm) {
          disarmGhostSchedule(ctx.schedule);
          return;
        }

        void (async () => {
          try {
            await deliverGhostLine(ctx.client, ctx.roomId, pickGhostSkipParting(), ctx.setPeerTyping);
            disarmGhostSchedule(ctx.schedule);
            await ctx.endRoom();
          } catch (e) {
            ctx.onError(e instanceof Error ? e.message : "Ghost skip failed");
          } finally {
            ctx.setPeerTyping(false);
          }
        })();
      });
    })();
  };

  const pingDeadline = ctx.schedule.pingDeadline ?? Date.now() + ghostPingMs;
  ctx.schedule.pingTimer = scheduleAtDeadline(pingDeadline, ctx.isActive, firePing);
}

/** Resume ghost wait timers after returning from background (deadline-based). */
export function resumeGhostSchedule(ctx: GhostScheduleContext) {
  if (!ctx.isActive() || !ctx.schedule.armed) return;

  const userReplied =
    countUserMessages(ctx.getMessages(), ctx.selfId) > ctx.schedule.userMessageCountAtArm;
  if (userReplied) {
    disarmGhostSchedule(ctx.schedule);
    return;
  }

  const now = Date.now();
  const s = ctx.schedule;

  if (s.pingSentAt === null && s.pingDeadline !== null && now >= s.pingDeadline) {
    pauseGhostSchedule(s);
    disarmGhostSchedule(s);
    armGhostSchedule(ctx);
    return;
  }

  if (s.pingSentAt !== null && s.skipDeadline !== null && now >= s.skipDeadline) {
    pauseGhostSchedule(s);
    disarmGhostSchedule(s);
    armGhostSchedule({ ...ctx, botMessageId: s.armedForBotMessageId });
    return;
  }

  pauseGhostSchedule(s);

  if (s.pingSentAt === null && s.pingDeadline !== null) {
    const firePing = () => {
      pauseGhostSchedule(s);
      disarmGhostSchedule(s);
      armGhostSchedule(ctx);
    };
    s.pingTimer = scheduleAtDeadline(s.pingDeadline, ctx.isActive, firePing);
    return;
  }

  if (s.pingSentAt !== null && s.skipDeadline !== null) {
    const fireSkip = () => {
      pauseGhostSchedule(s);
      disarmGhostSchedule(s);
      armGhostSchedule({ ...ctx, botMessageId: s.armedForBotMessageId });
    };
    s.skipTimer = scheduleAtDeadline(s.skipDeadline, ctx.isActive, fireSkip);
  }
}
