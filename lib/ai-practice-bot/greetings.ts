const CASUAL_OPENERS = [
  "hey",
  "yo",
  "heyy",
  "sup",
  "hii",
  "yo whats up",
  "hiii",
  "hey there",
  "heyyy",
  "hi",
  "hey :)",
  "whats up",
  "hey you",
] as const;

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Pick a canned opener - never mirrors the user's greeting back at them. */
export function pickPredefinedGreeting(seed: string): string {
  return CASUAL_OPENERS[hashSeed(seed) % CASUAL_OPENERS.length] ?? "hey";
}
