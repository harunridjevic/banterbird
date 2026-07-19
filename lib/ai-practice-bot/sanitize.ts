/** Strip em dashes / en dashes and ban the word "stranger" from bot chat lines. */
export function sanitizeBotChatLine(text: string): string {
  let out = text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\bstrangers?\b/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  // BanterBird has no profiles — rewrite dating-app hallucinations.
  if (/\b(saw|see|check(ed)?|look(ed)? at|view(ed)?)\b.{0,24}\b(your|ur)\b.{0,12}\bprofile\b/i.test(out)) {
    return "hey";
  }
  if (/\b(your|ur)\b.{0,12}\bprofile\b/i.test(out) && /\b(hi|hey|hello|noticed|liked)\b/i.test(out)) {
    return "hey";
  }
  out = out.replace(/\bprofile\b/gi, "chat");
  return out.replace(/\s{2,}/g, " ").trim();
}

export function sanitizeBotChatLines(lines: string[]): string[] {
  return lines.map(sanitizeBotChatLine).filter(Boolean);
}
