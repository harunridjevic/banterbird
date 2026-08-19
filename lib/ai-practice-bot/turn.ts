import type { BotPersona } from "@/lib/ai-practice-bot/persona";
import { personaTiming } from "@/lib/ai-practice-bot/persona";
import {
  sessionPolicyFromSettings,
  type BotSettings,
} from "@/lib/ops/bot-settings";
import {
  contextualFallbackReply,
  countInappropriateUserTurns,
  filterRedundantSelfDisclosure,
  isAggressiveConversation,
  isAnnoyingConversation,
  isDryConversation,
  isGenericCannedLine,
  isNonResponsiveBotReply,
  isUserLeavingConversation,
  isGoodbyeFollowUp,
  isGoodbyeContextActive,
  isUserCallingOutContradiction,
  isBotAnnouncingOwnLeave,
  countUserGoodbyes,
  botAlreadyTriedStay,
  pickContradictionClarifyLine,
  pickGoodbyeAckParting,
  midChatStubReply,
  pickBoringSkipParting,
  pickExcuseSkipParting,
  pickGhostPing,
  pickGhostSkipParting,
  pickGoodbyeStayLine,
  pickLeavingSkipParting,
  pickSkipParting,
  pickInappropriateSkipParting,
  trimContradictoryReplyLines,
  type BotSelfMemory,
  type UserMemory,
} from "@/lib/ai-practice-bot/memory";
import { sanitizeBotChatLine } from "@/lib/ai-practice-bot/sanitize";

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

function seedFromHistory(history: ChatTurn[]): string {
  return history.map((m) => m.content).join("|") || "open";
}

function normalizeLines(raw: unknown, max = 3): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LINE);
    const clean = sanitizeBotChatLine(t);
    if (!isAcceptableChatLine(clean)) continue;
    out.push(clean);
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
  botSelf?: BotSelfMemory,
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
        const t = sanitizeBotChatLine(p.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LINE));
        return withTiming(persona, {
          action: "skip",
          parting: isAcceptableChatLine(t) ? t : null,
        }, settings);
      }
      return withTiming(persona, { action: "skip", parting: null }, settings);
    }

    if (o.action === "away") {
      if (isGoodbyeContextActive(history)) {
        return withTiming(
          persona,
          { action: "skip", parting: pickGoodbyeAckParting(seedFromHistory(history)) },
          settings,
        );
      }
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
        const self = botSelf ?? { disclosedAge: undefined, disclosedCountry: undefined };
        lines = filterRedundantSelfDisclosure(lines, self, persona);
        lines = trimContradictoryReplyLines(lines);
        const first = lines[0]!;
        const lastUser = history.filter((m) => m.role === "user").pop()?.content ?? "";
        const userAskedSomething =
          lastUser.includes("?") || lastUser.trim().split(/\s+/).length >= 3;
        if (userAskedSomething && isGenericCannedLine(first)) {
          return null;
        }
        if (isNonResponsiveBotReply(first, lastUser)) {
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
  const lastUser = users[users.length - 1]?.content ?? "";

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

  if (users.length === 0 || !history.some((m) => m.role === "assistant")) {
    return withTiming(persona, {
      action: "reply",
      messages: contextualFallbackReply(history, memory),
    }, settings);
  }

  if (isUserCallingOutContradiction(lastUser)) {
    return withTiming(
      persona,
      { action: "reply", messages: [pickContradictionClarifyLine(seed)] },
      settings,
    );
  }

  if (isGoodbyeFollowUp(history)) {
    return withTiming(
      persona,
      { action: "skip", parting: pickGoodbyeAckParting(seed) },
      settings,
    );
  }

  if (isUserLeavingConversation(history)) {
    // Second+ goodbye, or we already asked them to stay → leave immediately.
    if (countUserGoodbyes(history) >= 2 || botAlreadyTriedStay(history)) {
      return withTiming(persona, { action: "skip", parting: pickLeavingSkipParting() }, settings);
    }
    if (Math.random() < 0.38) {
      return withTiming(
        persona,
        { action: "reply", messages: [pickGoodbyeStayLine(seed)] },
        settings,
      );
    }
    return withTiming(persona, { action: "skip", parting: pickLeavingSkipParting() }, settings);
  }

  if (isAggressiveConversation(history) || isAnnoyingConversation(history)) {
    return withTiming(persona, { action: "skip", parting: pickBoringSkipParting(seed) }, settings);
  }

  if (/\b(kill you|murder|rape|pedo|cp\b|suicid)\b/i.test(lastUser)) {
    return withTiming(persona, { action: "skip", parting: "nah im out" }, settings);
  }

  if (
    users.length >= policy.longChatSkipAt &&
    (isDryConversation(history) || Math.random() < policy.longChatSkipChance / 100)
  ) {
    const useExcuse = Math.random() < policy.excuseSkipChance / 100;
    return withTiming(persona, {
      action: "skip",
      parting: useExcuse ? pickExcuseSkipParting(seed) : pickSkipParting(seed),
    }, settings);
  }

  // Mid-chat should use the LLM - callers must not route here for normal replies.
  return withTiming(persona, {
    action: "reply",
    messages: midChatStubReply(history),
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
  const lastUser = history.filter((m) => m.role === "user").pop()?.content ?? "";

  if (trigger === "idle_skip") {
    return withTiming(persona, { action: "skip", parting: pickGhostSkipParting() }, settings);
  }

  if (isUserCallingOutContradiction(lastUser)) {
    if (result.action === "reply" && !isBotAnnouncingOwnLeave(result.messages)) {
      return result;
    }
    return withTiming(
      persona,
      { action: "reply", messages: [pickContradictionClarifyLine(seed)] },
      settings,
    );
  }

  if (isGoodbyeFollowUp(history)) {
    if (result.action === "away" || (result.action === "reply" && isBotAnnouncingOwnLeave(result.messages))) {
      return withTiming(
        persona,
        { action: "skip", parting: pickGoodbyeAckParting(seed) },
        settings,
      );
    }
    if (result.action === "skip") {
      return withTiming(
        persona,
        { action: "skip", parting: pickGoodbyeAckParting(seed) },
        settings,
      );
    }
    if (result.action === "reply") {
      const combined = result.messages.join(" ").toLowerCase();
      const acknowledges =
        /\b(ok|okay|alright|fair|cya|bye|later|gn|cool|got it|np|no worries|sounds good)\b/.test(
          combined,
        );
      if (acknowledges && !isBotAnnouncingOwnLeave(result.messages)) {
        const parting =
          result.messages[result.messages.length - 1]?.trim() || pickGoodbyeAckParting(seed);
        return withTiming(persona, { action: "skip", parting }, settings);
      }
    }
    return withTiming(
      persona,
      { action: "skip", parting: pickGoodbyeAckParting(seed) },
      settings,
    );
  }

  if (isUserLeavingConversation(history)) {
    // Never stay twice; second goodbye always leaves.
    if (countUserGoodbyes(history) >= 2 || botAlreadyTriedStay(history)) {
      return withTiming(
        persona,
        { action: "skip", parting: pickLeavingSkipParting() },
        settings,
      );
    }
    if (result.action === "reply") {
      if (isBotAnnouncingOwnLeave(result.messages)) {
        return withTiming(
          persona,
          { action: "skip", parting: pickGoodbyeAckParting(seed) },
          settings,
        );
      }
      const combined = result.messages.join(" ").toLowerCase();
      const stayAttempt = /\b(wait|stay|why|wya|where u|dont go|don't go|one more|hold on|noo|already)\b/.test(
        combined,
      );
      if (stayAttempt) {
        // One short stay line only - never a multi-bubble rant after bye.
        return withTiming(
          persona,
          { action: "reply", messages: [result.messages[0]!.slice(0, 80)] },
          settings,
        );
      }
      const lastLine = result.messages[result.messages.length - 1]?.trim();
      const parting =
        lastLine && /\b(bye|cya|later|gn|night|see ya)\b/i.test(lastLine)
          ? lastLine
          : pickLeavingSkipParting();
      return withTiming(persona, { action: "skip", parting }, settings);
    }
    return result;
  }

  if (isAggressiveConversation(history) || isAnnoyingConversation(history)) {
    return withTiming(persona, {
      action: "skip",
      parting: pickBoringSkipParting(seed),
    }, settings);
  }

  if (countInappropriateUserTurns(history) >= policy.inappropriateContentSkipAt) {
    return withTiming(persona, {
      action: "skip",
      parting: pickInappropriateSkipParting(seed),
    }, settings);
  }

  if (result.action === "skip" || result.action === "away") {
    if (isGoodbyeContextActive(history)) {
      return withTiming(
        persona,
        { action: "skip", parting: pickGoodbyeAckParting(seed) },
        settings,
      );
    }
    return result;
  }

  if (result.action === "reply") {
    const trimmed = trimContradictoryReplyLines(result.messages);
    if (trimmed.length !== result.messages.length) {
      return { ...result, messages: trimmed };
    }
  }

  const dry = isDryConversation(history);
  const n = memory.userTurnCount;

  if (n >= policy.maxUserTurnsBeforeSkip) {
    const useExcuse = Math.random() < policy.excuseSkipChance / 100;
    return withTiming(persona, {
      action: "skip",
      parting: useExcuse ? pickExcuseSkipParting(seed) : pickSkipParting(seed),
    }, settings);
  }

  if (dry && n >= policy.drySkipMinUserTurns) {
    const useExcuse = Math.random() < policy.excuseSkipChance / 100;
    return withTiming(persona, {
      action: "skip",
      parting: useExcuse ? pickExcuseSkipParting("dry") : pickBoringSkipParting("dry"),
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
      `Chat length: ${memory.userTurnCount} user messages. If dry/boring/annoying/hostile, skip, parting like "ur boring bye".`,
    );
  }
  if (memory.inappropriateContent) {
    lines.push(
      'They got inappropriate — deflect ("idk", "i dont wanna talk about that") or skip if they keep pushing.',
    );
  }
  return lines.join("\n");
}

export function goodbyeContextOverlay(): string {
  return [
    "They are leaving or wrapping up the chat.",
    "If you have NOT asked why yet: ONE short stay line is ok (e.g. wait why, aw already), single message only.",
    "If you already asked why, OR they say bye again: MUST skip with ONE short parting (ok cya / alright fair). Do not keep chatting.",
    "NEVER say YOU are leaving (no brb, gotta go, ttyl) when THEY are the one leaving.",
    "If you say bye you MUST use skip action. Do not lecture them.",
  ].join(" ");
}

export function triggerOverlay(trigger: AiReplyTrigger, settings?: BotSettings | null): string {
  if (trigger === "idle_ping") {
    const secs = Math.round((settings?.ghostPingMs ?? 45_000) / 1000);
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
