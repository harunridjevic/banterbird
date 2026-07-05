import type { ChatTurn } from "@/lib/ai-practice-bot/turn";
import type { BotPersona } from "@/lib/ai-practice-bot/persona";
import { personaAllowsSexualChat } from "@/lib/ai-practice-bot/persona";
import {
  countSexualUserTurns,
  isAggressiveConversation,
  isAnnoyingConversation,
  isDryConversation,
  pickBoringSkipParting,
  pickSkipParting,
  pickStrictSexualSkipParting,
} from "@/lib/ai-practice-bot/memory";
import { sessionPolicyFromSettings, type BotSettings } from "@/lib/ops/bot-settings";

/** Client-side skip before calling the LLM — boring / long / hostile / leaving. */
export function shouldClientSkipChat(
  history: ChatTurn[],
  persona?: BotPersona,
  settings?: BotSettings | null,
): { skip: boolean; parting: string | null } {
  const policy = sessionPolicyFromSettings(settings);
  const userLines = history.filter((m) => m.role === "user");
  const n = userLines.length;
  const seed = history.map((m) => m.content).join("|");

  if (isAggressiveConversation(history) || isAnnoyingConversation(history)) {
    return { skip: true, parting: pickBoringSkipParting(seed) };
  }

  if (
    persona?.sexualDisposition === "strict" &&
    countSexualUserTurns(history) >= policy.strictSexualSkipAt
  ) {
    return { skip: true, parting: pickStrictSexualSkipParting(seed) };
  }

  if (n >= policy.maxUserTurnsBeforeSkip) {
    return { skip: true, parting: pickSkipParting(seed) };
  }

  if (isDryConversation(history) && n >= policy.drySkipMinUserTurns) {
    return { skip: true, parting: pickBoringSkipParting("dry") };
  }

  return { skip: false, parting: null };
}
