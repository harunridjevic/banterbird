import type { BotPersona } from "@/lib/ai-practice-bot/persona";
import { personaAllowsSexualChat, personaTiming } from "@/lib/ai-practice-bot/persona";
import {
  sessionPolicyFromSettings,
  type BotSettings,
} from "@/lib/ops/bot-settings";
import {
  contextualFallbackReply,
  countSexualUserTurns,
  isAggressiveConversation,
  isAnnoyingConversation,
  isDryConversation,
  isGenericCannedLine,
  isUserLeavingConversation,
  pickBoringSkipParting,
  pickGhostPing,
  pickGhostSkipParting,
  pickLeavingSkipParting,
  pickSkipParting,
  pickStrictSexualSkipParting,
  type UserMemory,
} from "@/lib/ai-practice-bot/memory";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type BotTiming = ReturnType<typeof personaTiming>;

export type AiPracticeTurnResult =
  | { action: "reply"; messages: string[]; timing: BotTiming }
  | { action: "skip"; parting: string | null; timing: BotTiming }
  | {
      action: "away";
      messages: string[];
      awayMs: number;
      returnMessages: string[];
      timing: BotTiming;
    };

export type AiReplyTrigger = "normal" | "idle_ping" | "idle_skip";

const GEMINI_OPENER_USER_TURN = ".";

const META_REPLY_RE =
  /\b(json|here is the|single json|reply with only|object|schema|format)\b|^\s*\{|"action"\s*:/i;

export function isAcceptableChatLine(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t === GEMINI_OPENER_USER_TURN) return false;
  if (META_REPLY_RE.test(t)) return false;
  if (/^\s*\{[\s\S]*\}\s*$/.test(t)) return false;
  return true;
}

const MAX_CHAT_LINE = 400;

function normalizeLines(raw: unknown, max = 3): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LINE);
    if (!isAcceptableChatLine(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function withTiming(
  persona: BotPersona,
  turn:
    | { action: "reply"; messages: string[] }
    | { action: "skip"; parting: string | null }
    | { action: "away"; messages: string[]; awayMs: number; returnMessages: string[] },
  settings?: BotSettings | null,
): AiPracticeTurnResult {
  return { ...turn, timing: personaTiming(persona, settings) };
}

export function parseModelTurn(
  raw: string,
  history: ChatTurn[],
  persona: BotPersona,
  memory: UserMemory,
  settings?: BotSettings | null,
): AiPracticeTurnResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        obj = JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  if (obj && typeof obj === "object" && obj !== null) {
    const o = obj as Record<string, unknown>;

    if (o.action === "skip") {
      const p = o.parting;
      if (typeof p === "string") {
        const t = p.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LINE);
        return withTiming(persona, {
          action: "skip",
          parting: isAcceptableChatLine(t) ? t : null,
        }, settings);
      }
      return withTiming(persona, { action: "skip", parting: null }, settings);
    }

    if (o.action === "away") {
      const lines = normalizeLines(o.messages, 2);
      const returns = normalizeLines(o.returnMessages, 2);
      const awaySec =
        typeof o.awaySeconds === "number"
          ? o.awaySeconds
          : typeof o.awayMs === "number"
            ? o.awayMs / 1000
            : 45;
      const awayMs = Math.round(Math.min(120, Math.max(20, awaySec)) * 1000);
      if (lines.length > 0) {
        return withTiming(persona, {
          action: "away",
          messages: lines,
          awayMs,
          returnMessages: returns.length > 0 ? returns : ["im back"],
        }, settings);
      }
    }

    if (o.action === "reply" || o.action === undefined) {
      let lines = normalizeLines(o.messages, 3);
      if (lines.length === 0) {
        const single =
          (typeof o.text === "string" ? o.text : null) ??
          (typeof o.reply === "string" ? o.reply : null);
        if (single) {
          const t = single.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LINE);
          if (isAcceptableChatLine(t)) lines = [t];
        }
      }
      if (lines.length > 0) {
        const first = lines[0]!;
        if (
          memory.sexualVibe &&
          personaAllowsSexualChat(persona, true) &&
          isGenericCannedLine(first)
        ) {
          return null;
        }
        return withTiming(persona, { action: "reply", messages: lines }, settings);
      }
    }
  }

  return null;
}

export function decideFallbackTurn(
  history: ChatTurn[],
  persona: BotPersona,
  trigger: AiReplyTrigger,
  memory: UserMemory,
  settings?: BotSettings | null,
): AiPracticeTurnResult {
  const policy = sessionPolicyFromSettings(settings);
  const users = history.filter((m) => m.role === "user");
  const seed = history.map((m) => m.content).join("|") || "open";

  if (trigger === "idle_skip") {
    return withTiming(persona, {
      action: "skip",
      parting: pickGhostSkipParting(),
    }, settings);
  }

  if (trigger === "idle_ping") {
    return withTiming(persona, {
      action: "reply",
      messages: [pickGhostPing()],
    }, settings);
  }

  if (users.length === 0) {
    return withTiming(persona, {
      action: "reply",
      messages: contextualFallbackReply(
        history,
        memory,
        personaAllowsSexualChat(persona, memory.sexualVibe),
      ),
    }, settings);
  }

  const last = users[users.length - 1]?.content ?? "";

  if (isUserLeavingConversation(history)) {
    return withTiming(persona, { action: "skip", parting: pickLeavingSkipParting() }, settings);
  }

  if (isAnnoyingConversation(history)) {
    return withTiming(persona, { action: "skip", parting: pickBoringSkipParting(seed) }, settings);
  }

  if (/\b(kill you|murder|rape|pedo|cp\b|suicid)\b/i.test(last)) {
    return withTiming(persona, { action: "skip", parting: "nah im out" }, settings);
  }

  if (
    users.length >= policy.longChatSkipAt &&
    (isDryConversation(history) || Math.random() < policy.longChatSkipChance / 100)
  ) {
    return withTiming(persona, {
      action: "skip",
      parting: pickSkipParting(seed),
    }, settings);
  }

  return withTiming(persona, {
    action: "reply",
    messages: contextualFallbackReply(
      history,
      memory,
      personaAllowsSexualChat(persona, memory.sexualVibe),
    ),
  }, settings);
}

export function applySessionPolicy(
  history: ChatTurn[],
  result: AiPracticeTurnResult,
  persona: BotPersona,
  memory: UserMemory,
  trigger: AiReplyTrigger,
  settings?: BotSettings | null,
): AiPracticeTurnResult {
  const policy = sessionPolicyFromSettings(settings);
  const seed = history.map((m) => m.content).join("|");

  if (trigger === "idle_skip") {
    return withTiming(persona, { action: "skip", parting: pickGhostSkipParting() }, settings);
  }

  if (isUserLeavingConversation(history)) {
    return withTiming(persona, { action: "skip", parting: pickLeavingSkipParting() }, settings);
  }

  if (isAggressiveConversation(history) || isAnnoyingConversation(history)) {
    return withTiming(persona, {
      action: "skip",
      parting: pickBoringSkipParting(seed),
    }, settings);
  }

  if (
    persona.sexualDisposition === "strict" &&
    countSexualUserTurns(history) >= policy.strictSexualSkipAt
  ) {
    return withTiming(persona, {
      action: "skip",
      parting: pickStrictSexualSkipParting(seed),
    }, settings);
  }

  if (result.action === "skip" || result.action === "away") return result;

  const dry = isDryConversation(history);
  const n = memory.userTurnCount;

  if (n >= policy.maxUserTurnsBeforeSkip) {
    return withTiming(persona, {
      action: "skip",
      parting: pickSkipParting(seed),
    }, settings);
  }

  if (dry && n >= policy.drySkipMinUserTurns) {
    return withTiming(persona, {
      action: "skip",
      parting: pickBoringSkipParting("dry"),
    }, settings);
  }

  return result;
}

export function sessionContextOverlay(
  memory: UserMemory,
  persona: BotPersona,
  settings?: BotSettings | null,
): string {
  const policy = sessionPolicyFromSettings(settings);
  const lines: string[] = [];
  if (memory.userTurnCount >= policy.sessionHintAt) {
    lines.push(
      `Chat length: ${memory.userTurnCount} user messages. If dry/boring/annoying/hostile, skip — parting like "ur boring bye".`,
    );
  }
  if (persona.sexualDisposition === "horny") {
    lines.push(
      "You are a horny stranger (~20%) — you may flirt/escalate sexually. No socials/video/meetup.",
    );
  } else if (persona.sexualDisposition === "persuadable" && memory.sexualVibe) {
    lines.push(
      "They flirted first — you are persuadable (~30%) so explicit dirty text ok now. No socials/video/meetup.",
    );
  } else if (persona.sexualDisposition === "persuadable") {
    lines.push("Persuadable bot — stay normal until they flirt; then you can go sexual.");
  } else if (memory.sexualVibe) {
    lines.push(
      'Strict bot (~50%) — deflect sexual stuff ("idk", "i dont wanna talk about that") or skip if they keep pushing.',
    );
  }
  return lines.join("\n");
}

export function triggerOverlay(trigger: AiReplyTrigger, settings?: BotSettings | null): string {
  if (trigger === "idle_ping") {
    const secs = Math.round((settings?.ghostPingMs ?? 10_000) / 1000);
    return `They have not replied in ~${secs} seconds. Send ONE short nudge (reply): "hello??" or similar.`;
  }
  if (trigger === "idle_skip") {
    return 'They ghosted after your nudge. MUST skip. Parting: "bye" or "if u dont wanna talk bye".';
  }
  return "";
}

export function jsonBody(result: AiPracticeTurnResult) {
  if (result.action === "reply") {
    return {
      action: "reply" as const,
      messages: result.messages,
      reply: result.messages[0],
      timing: result.timing,
    };
  }
  if (result.action === "away") {
    return {
      action: "away" as const,
      messages: result.messages,
      awayMs: result.awayMs,
      returnMessages: result.returnMessages,
      timing: result.timing,
    };
  }
  return {
    action: "skip" as const,
    parting: result.parting,
    timing: result.timing,
  };
}

export { GEMINI_OPENER_USER_TURN };
