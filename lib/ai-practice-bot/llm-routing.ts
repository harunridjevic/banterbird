import type { ChatTurn } from "@/lib/ai-practice-bot/turn";

/** Local/canned replies are only for the opening intro — never mid-conversation. */
export function shouldUseLocalReply(_history: ChatTurn[], isOpener: boolean): boolean {
  return isOpener;
}
