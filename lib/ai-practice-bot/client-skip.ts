import type { ChatTurn } from "@/lib/ai-practice-bot/turn";
import {
  countInappropriateUserTurns,
  isAggressiveConversation,
  isAnnoyingConversation,
  isDryConversation,
  pickBoringSkipParting,
  pickExcuseSkipParting,
  pickInappropriateSkipParting,
  pickSkipParting,
} from "@/lib/ai-practice-bot/memory";
import { sessionPolicyFromSettings, type BotSettings } from "@/lib/ops/bot-settings";

/** Client-side skip before calling the LLM - boring / long / hostile / leaving. */
export function shouldClientSkipChat(
  history: ChatTurn[],
  settings?: BotSettings | null,
): { skip: boolean; parting: string | null } {
  const policy = sessionPolicyFromSettings(settings);
  const userLines = history.filter((m) => m.role === "user");
  const n = userLines.length;
  const seed = history.map((m) => m.content).join("|");

  if (isAggressiveConversation(history) || isAnnoyingConversation(history)) {
    return { skip: true, parting: pickBoringSkipParting(seed) };
  }

  if (countInappropriateUserTurns(history) >= policy.inappropriateContentSkipAt) {
    return { skip: true, parting: pickInappropriateSkipParting(seed) };
  }

  if (n >= policy.maxUserTurnsBeforeSkip) {
    const useExcuse = Math.random() < policy.excuseSkipChance / 100;
    return { skip: true, parting: useExcuse ? pickExcuseSkipParting(seed) : pickSkipParting(seed) };
  }

  if (isDryConversation(history) && n >= policy.drySkipMinUserTurns) {
    const useExcuse = Math.random() < policy.excuseSkipChance / 100;
    return { skip: true, parting: useExcuse ? pickExcuseSkipParting("dry") : pickBoringSkipParting("dry") };
  }

  return { skip: false, parting: null };
}
