import type { ChatTurn } from "@/lib/ai-practice-bot/turn";
import type { BotPersona } from "@/lib/ai-practice-bot/persona";
import { personaAllowsSexualChat } from "@/lib/ai-practice-bot/persona";
import {
  countSexualUserTurns,
  isAggressiveConversation,
  isAnnoyingConversation,
  isDryConversation,
  isUserLeavingConversation,
  pickBoringSkipParting,
  pickLeavingSkipParting,
  pickSkipParting,
  pickStrictSexualSkipParting,
} from "@/lib/ai-practice-bot/memory";

/** Client-side skip before calling the LLM — boring / long / hostile / leaving. */
export function shouldClientSkipChat(
  history: ChatTurn[],
  persona?: BotPersona,
): { skip: boolean; parting: string | null } {
  const userLines = history.filter((m) => m.role === "user");
  const n = userLines.length;
  const seed = history.map((m) => m.content).join("|");

  if (isUserLeavingConversation(history)) {
    return { skip: true, parting: pickLeavingSkipParting() };
  }

  if (isAggressiveConversation(history) || isAnnoyingConversation(history)) {
    return { skip: true, parting: pickBoringSkipParting(seed) };
  }

  if (
    persona?.sexualDisposition === "strict" &&
    countSexualUserTurns(history) >= 2
  ) {
    return { skip: true, parting: pickStrictSexualSkipParting(seed) };
  }

  if (n >= 10) {
    return { skip: true, parting: pickSkipParting(seed) };
  }

  if (isDryConversation(history) && n >= 3) {
    return { skip: true, parting: pickBoringSkipParting("dry") };
  }

  return { skip: false, parting: null };
}
