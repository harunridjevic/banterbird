import type { SupabaseClient } from "@supabase/supabase-js";
import {
  preTypingHesitation,
  readDelayBeforeReplyMs,
  readDelayOpenerMs,
  runHumanlikeTyping,
  typingDurationForReply,
  type TimingScale,
} from "./typing";

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
  };
};

class BotTurnAbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "BotTurnAbortedError";
  }
}

function sleep(ms: number, shouldAbort?: () => boolean) {
  if (!shouldAbort) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (shouldAbort()) {
        reject(new BotTurnAbortedError());
        return;
      }
      const remaining = ms - (Date.now() - start);
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.setTimeout(tick, Math.min(250, remaining));
    };
    window.setTimeout(tick, Math.min(250, ms));
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
    p_content: content,
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
    await preTypingHesitation(scale);
    await runHumanlikeTyping(
      setPeerTyping,
      typingDurationForReply(line, scale),
      line.length,
    );
    const err = await insertBotLine(client, roomId, line);
    if (err) onError(err.message);
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
      } else {
        await sleep(500 + Math.random() * 1400, shouldAbort);
        setPeerTyping(true);
        await sleep(650 + Math.random() * 1700, shouldAbort);
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
    throw e;
  }
}

export type { TimingScale };
