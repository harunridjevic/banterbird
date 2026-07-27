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

const FLIRTY_OPENERS = [
  "heyy ;)",
  "well hello",
  "hey cutie",
  "mm heyy",
  "hey you",
  "well hi there",
  "hey handsome",
  "hi cutie",
  "heyy whats up",
  "well hey",
  "hi you ;)",
] as const;

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Pick a canned opener - never mirrors the user's greeting back at them. */
export function pickPredefinedGreeting(seed: string, flirty: boolean): string {
  const list = flirty ? FLIRTY_OPENERS : CASUAL_OPENERS;
  return list[hashSeed(seed) % list.length] ?? "hey";
}
