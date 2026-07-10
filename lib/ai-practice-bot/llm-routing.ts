import type { ChatTurn } from "@/lib/ai-practice-bot/turn";

/** Local/canned replies for the bot's first message — never mid-conversation. */
export function shouldUseLocalReply(history: ChatTurn[], isOpener: boolean): boolean {
  if (isOpener) return true;
  return !history.some((m) => m.role === "assistant");
}
