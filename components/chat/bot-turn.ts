import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeBotChatLine } from "@/lib/ai-practice-bot/sanitize";
import {
  readDelayBeforeReplyMs,
  readDelayOpenerMs,
  typeThenDeliver,
  type TimingScale,
} from "./typing";
import { delayMs } from "@/lib/hooks/visibility-delay";

export type BotApiBody = {
  action?: string;
  reply?: string;
  messages?: string[];
  parting?: string | null;
  awayMs?: number;
  returnMessages?: string[];
  timing?: Partial<TimingScale> & {
    burstGapMs?: number;
    idlePingMs?: number;
    idleSkipMs?: number;
    postSkipDelayMs?: number;
  };
};

class BotTurnAbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "BotTurnAbortedError";
  }
}

function sleep(ms: number, shouldAbort?: () => boolean) {
  return delayMs(ms, shouldAbort).catch((e) => {
    if (e instanceof Error && e.message === "aborted") {
      throw new BotTurnAbortedError();
    }
    throw e;
  });
}

function linesFromBody(body: BotApiBody): string[] {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages.map((m) => m.trim()).filter(Boolean);
  }
  const single = body.reply?.trim();
  return single ? [single] : [];
}

async function insertBotLine(
  client: SupabaseClient,
  roomId: string,
  content: string,
) {
  const { error } = await client.rpc("insert_ai_chat_message", {
    p_room_id: roomId,
    p_content: sanitizeBotChatLine(content),
  });
  return error;
}

async function deliverLines(
  lines: string[],
  scale: TimingScale,
  burstGapMs: number,
  setPeerTyping: (v: boolean) => void,
  client: SupabaseClient,
  roomId: string,
  onError: (msg: string) => void,
  shouldAbort?: () => boolean,
) {
  for (let i = 0; i < lines.length; i++) {
    if (shouldAbort?.()) throw new BotTurnAbortedError();
    const line = lines[i]!;
    await typeThenDeliver(
      setPeerTyping,
      line,
      scale,
      async () => {
        const err = await insertBotLine(client, roomId, line);
        if (err) onError(err.message);
      },
      shouldAbort,
    );
    if (i < lines.length - 1 && burstGapMs > 0) {
      await sleep(burstGapMs + Math.random() * 420, shouldAbort);
    }
  }
}

export async function executeBotTurn(opts: {
  body: BotApiBody;
  client: SupabaseClient;
  roomId: string;
  setPeerTyping: (v: boolean) => void;
  onError: (msg: string) => void;
  userMessageLen?: number;
  isOpener?: boolean;
  shouldAbort?: () => boolean;
}): Promise<"skip" | "done" | "aborted"> {
  const { body, client, roomId, setPeerTyping, onError, userMessageLen = 0, isOpener, shouldAbort } = opts;
  const scale: TimingScale = {
    readScale: body.timing?.readScale ?? 1,
    typingScale: body.timing?.typingScale ?? 1,
  };
  const burstGapMs = body.timing?.burstGapMs ?? 0;

  try {
    if (body.action === "skip") {
      const parting =
        typeof body.parting === "string" && body.parting.trim().length > 0
          ? body.parting.trim()
          : null;
      if (parting) {
        await deliverLines([parting], scale, 0, setPeerTyping, client, roomId, onError, shouldAbort);
        const postSkipDelay = body.timing?.postSkipDelayMs ?? 3000;
        if (postSkipDelay > 0) {
          await sleep(postSkipDelay, shouldAbort);
        }
      } else {
        const pauseMs = Math.round(500 + Math.random() * 1400);
        setPeerTyping(true);
        await sleep(pauseMs, shouldAbort);
        setPeerTyping(false);
      }
      return "skip";
    }

    if (body.action === "away") {
      const awayLines = linesFromBody(body);
      const returnLines =
        Array.isArray(body.returnMessages) && body.returnMessages.length > 0
          ? body.returnMessages.map((m) => m.trim()).filter(Boolean)
          : ["im back"];
      const awayMs = typeof body.awayMs === "number" ? body.awayMs : 45_000;

      if (awayLines.length > 0) {
        await deliverLines(awayLines, scale, burstGapMs, setPeerTyping, client, roomId, onError, shouldAbort);
      }
      setPeerTyping(false);
      await sleep(awayMs, shouldAbort);
      await deliverLines(returnLines, scale, burstGapMs, setPeerTyping, client, roomId, onError, shouldAbort);
      return "done";
    }

    const lines = linesFromBody(body);
    if (lines.length === 0) return "done";

    if (!isOpener) {
      await sleep(readDelayBeforeReplyMs(userMessageLen, scale), shouldAbort);
    } else {
      await sleep(readDelayOpenerMs(scale), shouldAbort);
    }

    await deliverLines(lines, scale, burstGapMs, setPeerTyping, client, roomId, onError, shouldAbort);
    return "done";
  } catch (e) {
    setPeerTyping(false);
    if (e instanceof BotTurnAbortedError) return "aborted";
    // Some typing delays call `delayMs` directly and may throw the raw abort error.
    // Treat it the same as an intentional bot-turn abort (tab hidden, navigation, etc).
    if (e instanceof Error && e.message === "aborted") return "aborted";
    throw e;
  }
}

export type { TimingScale };
