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
  pingTimer: ReturnType<typeof setTimeout> | null;
  skipTimer: ReturnType<typeof setTimeout> | null;
  userMessageCountAtArm: number;
  armed: boolean;
  armedForBotMessageId: string | null;
  /** Set when ghost ping fires — blocks re-arm until skip or disarm. */
  pingSentAt: number | null;
};

export function createGhostSchedule(): GhostSchedule {
  return {
    pingTimer: null,
    skipTimer: null,
    userMessageCountAtArm: 0,
    armed: false,
    armedForBotMessageId: null,
    pingSentAt: null,
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

/**
 * Arm ghost timers when the bot finishes a turn. Fires ping at 10s and skip 6s later
 * unless the user sends a message in the meantime.
 */
export function armGhostSchedule(ctx: GhostScheduleContext) {
  if (!ctx.isActive()) return;

  const ghostPingMs = ctx.ghostPingMs ?? GHOST_PING_MS;
  const ghostSkipMs = ctx.ghostSkipMs ?? GHOST_SKIP_MS;

  const botId = ctx.botMessageId ?? null;
  if (
    botId &&
    ctx.schedule.armed &&
    ctx.schedule.armedForBotMessageId === botId
  ) {
    return;
  }

  // Mid-ghost sequence (ping sent or skip pending) — do not reset timers.
  if (ctx.schedule.pingSentAt !== null || ctx.schedule.skipTimer !== null) {
    return;
  }

  disarmGhostSchedule(ctx.schedule);
  if (!ctx.isActive()) return;

  ctx.schedule.armedForBotMessageId = botId;
  ctx.schedule.userMessageCountAtArm = countUserMessages(ctx.getMessages(), ctx.selfId);
  ctx.schedule.armed = true;

  ctx.schedule.pingTimer = setTimeout(() => {
    if (!ctx.isActive() || !ctx.schedule.armed) return;
    const messages = ctx.getMessages();
    if (countUserMessages(messages, ctx.selfId) > ctx.schedule.userMessageCountAtArm) {
      disarmGhostSchedule(ctx.schedule);
      return;
    }

    ctx.schedule.pingSentAt = Date.now();

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

      ctx.schedule.skipTimer = setTimeout(() => {
        if (!ctx.isActive() || !ctx.schedule.armed) return;
        if (countUserMessages(ctx.getMessages(), ctx.selfId) > ctx.schedule.userMessageCountAtArm) {
          disarmGhostSchedule(ctx.schedule);
          return;
        }

        void (async () => {
          try {
            await deliverGhostLine(
              ctx.client,
              ctx.roomId,
              pickGhostSkipParting(),
              ctx.setPeerTyping,
            );
            disarmGhostSchedule(ctx.schedule);
            await ctx.endRoom();
          } catch (e) {
            ctx.onError(e instanceof Error ? e.message : "Ghost skip failed");
          } finally {
            ctx.setPeerTyping(false);
          }
        })();
      }, ghostSkipMs);
    })();
  }, ghostPingMs);
}
