/** Strip em dashes / en dashes and ban the word "stranger" from bot chat lines. */
export function sanitizeBotChatLine(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\bstrangers?\b/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizeBotChatLines(lines: string[]): string[] {
  return lines.map(sanitizeBotChatLine).filter(Boolean);
}
