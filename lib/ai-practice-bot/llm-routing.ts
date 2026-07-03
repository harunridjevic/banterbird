import type { ChatTurn } from "@/lib/ai-practice-bot/turn";

const TRIVIAL_MESSAGE_RE =
  /^(hi+|hey+|hello+|yo+|sup|wassup|what'?s up|howdy|hola|heya|asl|m\s*\/\s*f|f\s*\/\s*m|male|female|m|f|\?+|\.+)$/i;

const BORING_REPLY_RE =
  /^(k|ok|okay|yeah|yea|yep|mhm|hm+|lol|haha|idk|sure|nice|cool|same|true|wow|omg|ah+|uh+)$/i;

/** Short greetings and one-word pings — local reply is fine. */
export function isTrivialUserMessage(content: string): boolean {
  const text = content.trim().toLowerCase().replace(/[^\w\s?/]/g, "");
  if (!text) return true;
  if (text.length > 28) return false;
  if (TRIVIAL_MESSAGE_RE.test(text)) return true;
  if (text.length <= 12 && BORING_REPLY_RE.test(text)) return true;
  return false;
}

/** Skip paid LLM for openers and low-signal user messages. */
export function shouldUseLocalReply(history: ChatTurn[], isOpener: boolean): boolean {
  if (isOpener) return true;

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (!lastUser) return true;

  return isTrivialUserMessage(lastUser.content);
}
