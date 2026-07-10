import { delayMs } from "@/lib/hooks/visibility-delay";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export type TimingScale = {
  readScale?: number;
  typingScale?: number;
};

function scale(n: number, s: number) {
  return Math.round(n * (s > 0 ? s : 1));
}

/** Pause before we even ask the model — simulates reading what you wrote. */
export function readDelayBeforeReplyMs(userMessageLen: number, timing: TimingScale = {}) {
  const s = timing.readScale ?? 1;
  const base = 520 + Math.random() * 2200;
  const perChar = userMessageLen * (10 + Math.random() * 24);
  return clamp(scale(base + perChar, s), 280, 7200);
}

export function readDelayOpenerMs(timing: TimingScale = {}) {
  const s = timing.readScale ?? 1;
  return clamp(scale(480 + Math.random() * 1700, s), 300, 3800);
}

/** Deterministic typing time from message length (~62ms/char + small base). */
const TYPING_BASE_MS = 100;
const TYPING_MS_PER_CHAR = 62;

export function typingDurationForReply(reply: string, timing: TimingScale = {}) {
  const s = timing.typingScale ?? 1;
  const len = reply.trim().length || 1;
  const scaled = (TYPING_BASE_MS + len * TYPING_MS_PER_CHAR) * s;
  const min = len <= 4 ? 300 : len <= 10 ? 380 : 450;
  return clamp(Math.round(scaled), min, 16_000);
}

/**
 * Show the typing bubble for exactly the duration needed for this message length,
 * then hide it (unless keepVisible — caller hides after the message is inserted).
 */
export async function runHumanlikeTyping(
  setTyping: (v: boolean) => void,
  totalMs: number,
  _replyLen?: number,
  shouldAbort?: () => boolean,
  options?: { keepVisible?: boolean },
) {
  setTyping(true);
  try {
    await delayMs(totalMs, shouldAbort);
  } finally {
    if (!options?.keepVisible) {
      setTyping(false);
    }
  }
}

/** Typing bubble on for the exact computed duration, then off after insert. */
export async function typeThenDeliver(
  setTyping: (v: boolean) => void,
  line: string,
  timing: TimingScale,
  deliver: () => Promise<void>,
  shouldAbort?: () => boolean,
) {
  const ms = typingDurationForReply(line, timing);
  setTyping(true);
  try {
    await delayMs(ms, shouldAbort);
    await deliver();
  } finally {
    setTyping(false);
  }
}
