/** Strip em dashes and en dashes from bot chat lines. */
export function sanitizeBotChatLine(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizeBotChatLines(lines: string[]): string[] {
  return lines.map(sanitizeBotChatLine).filter(Boolean);
}
