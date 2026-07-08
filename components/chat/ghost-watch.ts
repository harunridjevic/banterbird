import type { SupabaseClient } from "@supabase/supabase-js";
import { pickGhostPing, pickGhostSkipParting } from "@/lib/ai-practice-bot/memory";
import { runHumanlikeTyping, typingDurationForReply } from "@/components/chat/typing";

export const GHOST_PING_MS = 45_000;
export const GHOST_SKIP_MS = 20_000;

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
  pingDeadline: number | null;
  skipDeadline: number | null;
  /** Bumped to invalidate in-flight timer callbacks. */
  timerEpoch: number;
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
    timerEpoch: 0,
  };
}

function clearGhostTimers(schedule: GhostSchedule) {
  schedule.timerEpoch += 1;
  if (schedule.pingTimer !== null) {
    window.clearTimeout(schedule.pingTimer);
    schedule.pingTimer = null;
  }
  if (schedule.skipTimer !== null) {
    window.clearTimeout(schedule.skipTimer);
    schedule.skipTimer = null;
  }
}

export function disarmGhostSchedule(schedule: GhostSchedule) {
  clearGhostTimers(schedule);
  schedule.armed = false;
  schedule.armedForBotMessageId = null;
  schedule.pingSentAt = null;
  schedule.pingDeadline = null;
  schedule.skipDeadline = null;
}

/** Clear timers but keep armed state (tab backgrounded). */
export function pauseGhostSchedule(schedule: GhostSchedule) {
  clearGhostTimers(schedule);
}

function countUserMessages(messages: GhostMessage[], selfId: string): number {
  if (!selfId) return 0;
  return messages.filter((m) => !isBotMessage(m) && m.user_id === selfId).length;
}

function userRepliedSinceArm(ctx: GhostScheduleContext): boolean {
  const msgs = ctx.getMessages();
  const selfId = ctx.selfId;
  if (!selfId) return true;

  const botId = ctx.schedule.armedForBotMessageId;
  if (botId) {
    const botIdx = msgs.findIndex((m) => m.id === botId);
    if (botIdx < 0) return true;
    return msgs.slice(botIdx + 1).some((m) => !isBotMessage(m) && m.user_id === selfId);
  }

  return countUserMessages(msgs, selfId) > ctx.schedule.userMessageCountAtArm;
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

function scheduleIn(
  schedule: GhostSchedule,
  delayMs: number,
  onFire: () => void,
): number {
  const epoch = schedule.timerEpoch;
  const delay = Math.max(0, delayMs);
  return window.setTimeout(() => {
    if (schedule.timerEpoch !== epoch || !schedule.armed) return;
    onFire();
  }, delay);
}

function scheduleSkipTimer(ctx: GhostScheduleContext) {
  const s = ctx.schedule;
  const ghostSkipMs = ctx.ghostSkipMs ?? GHOST_SKIP_MS;
  const skipDeadline = s.skipDeadline ?? Date.now() + ghostSkipMs;
  s.skipDeadline = skipDeadline;
  const delayMs = skipDeadline - Date.now();

  s.skipTimer = scheduleIn(s, delayMs, () => {
    if (!ctx.isActive() || !s.armed) return;
    if (userRepliedSinceArm(ctx)) {
      disarmGhostSchedule(s);
      return;
    }

    void (async () => {
      try {
        await deliverGhostLine(ctx.client, ctx.roomId, pickGhostSkipParting(), ctx.setPeerTyping);
        disarmGhostSchedule(s);
        await ctx.endRoom();
      } catch (e) {
        ctx.onError(e instanceof Error ? e.message : "Ghost skip failed");
      } finally {
        ctx.setPeerTyping(false);
      }
    })();
  });
}

function schedulePingTimer(ctx: GhostScheduleContext) {
  const s = ctx.schedule;
  const ghostPingMs = ctx.ghostPingMs ?? GHOST_PING_MS;
  const ghostSkipMs = ctx.ghostSkipMs ?? GHOST_SKIP_MS;
  const pingDeadline = s.pingDeadline ?? Date.now() + ghostPingMs;
  s.pingDeadline = pingDeadline;
  const delayMs = pingDeadline - Date.now();

  const firePing = () => {
    if (!ctx.isActive() || !s.armed) return;
    if (userRepliedSinceArm(ctx)) {
      disarmGhostSchedule(s);
      return;
    }

    s.pingSentAt = Date.now();
    s.pingDeadline = null;
    s.skipDeadline = Date.now() + ghostSkipMs;

    void (async () => {
      try {
        await deliverGhostLine(ctx.client, ctx.roomId, pickGhostPing(), ctx.setPeerTyping);
      } catch (e) {
        ctx.onError(e instanceof Error ? e.message : "Ghost ping failed");
        disarmGhostSchedule(s);
        return;
      } finally {
        ctx.setPeerTyping(false);
      }

      if (!ctx.isActive() || !s.armed) return;
      if (userRepliedSinceArm(ctx)) {
        disarmGhostSchedule(s);
        return;
      }

      scheduleSkipTimer(ctx);
    })();
  };

  s.pingTimer = scheduleIn(s, delayMs, firePing);
}

/** Push the idle ping back while the user is still composing. */
export function extendGhostPingDeadline(ctx: GhostScheduleContext) {
  const s = ctx.schedule;
  if (!s.armed || s.pingSentAt !== null || !ctx.selfId) return;

  const ghostPingMs = ctx.ghostPingMs ?? GHOST_PING_MS;
  pauseGhostSchedule(s);
  s.pingDeadline = Date.now() + ghostPingMs;
  schedulePingTimer(ctx);
}

/**
 * Arm ghost timers when the bot finishes a turn. Fires ping after idle time,
 * then skip parting if still no reply.
 */
export function armGhostSchedule(ctx: GhostScheduleContext) {
  if (!ctx.isActive() || !ctx.selfId) return;

  const botId = ctx.botMessageId ?? null;
  if (botId && ctx.schedule.armed && ctx.schedule.armedForBotMessageId === botId) {
    return;
  }

  if (ctx.schedule.pingSentAt !== null || ctx.schedule.skipTimer !== null) {
    return;
  }

  const msgs = ctx.getMessages();
  const last = msgs[msgs.length - 1];
  if (!last || !isBotMessage(last)) return;

  disarmGhostSchedule(ctx.schedule);
  if (!ctx.isActive()) return;

  ctx.schedule.armedForBotMessageId = botId ?? last.id;
  ctx.schedule.userMessageCountAtArm = countUserMessages(msgs, ctx.selfId);
  ctx.schedule.armed = true;
  ctx.schedule.pingDeadline = Date.now() + (ctx.ghostPingMs ?? GHOST_PING_MS);

  schedulePingTimer(ctx);
}

/**
 * After returning from background: re-schedule from stored deadlines. Overdue
 * timers fire immediately instead of resetting the idle window.
 */
export function refreshGhostAfterForeground(ctx: GhostScheduleContext) {
  if (!ctx.isActive() || !ctx.schedule.armed || !ctx.selfId) return;

  if (userRepliedSinceArm(ctx)) {
    disarmGhostSchedule(ctx.schedule);
    return;
  }

  pauseGhostSchedule(ctx.schedule);

  if (ctx.schedule.pingSentAt === null) {
    schedulePingTimer(ctx);
    return;
  }

  scheduleSkipTimer(ctx);
}

/** @deprecated Use refreshGhostAfterForeground */
export function resumeGhostSchedule(ctx: GhostScheduleContext) {
  refreshGhostAfterForeground(ctx);
}
