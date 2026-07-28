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

/** Pause before we even ask the model - simulates reading what you wrote. */
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

/**
 * Typing bubble duration from message length.
 * Tuned for casual phone typing - never flash-short even for "fast" personas.
 */
const TYPING_BASE_MS = 850;
const TYPING_MS_PER_CHAR = 130;

export function typingDurationForReply(reply: string, timing: TimingScale = {}) {
  // Floor at 1× so replySpeed 0.55 personas still type at a believable pace.
  // Slower personas (scale > 1) still type slower.
  const s = Math.max(timing.typingScale ?? 1, 1);
  const len = reply.trim().length || 1;
  // Light jitter (±10%) so identical lengths don't feel robotic.
  const jitter = 0.9 + Math.random() * 0.2;
  const scaled = (TYPING_BASE_MS + len * TYPING_MS_PER_CHAR) * s * jitter;
  // Hard floors so short lines ("hey", "lol") still linger on screen.
  const min = len <= 4 ? 1400 : len <= 12 ? 1800 : len <= 28 ? 2400 : 3000;
  return clamp(Math.round(scaled), min, 28_000);
}

/**
 * Show the typing bubble for exactly the duration needed for this message length,
 * then hide it (unless keepVisible - caller hides after the message is inserted).
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

/** Typing bubble on for the computed duration, then deliver, then briefly hold. */
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
    // Keep bubble up a beat so the message can land via realtime before it vanishes.
    await delayMs(180, shouldAbort);
  } finally {
    setTyping(false);
  }
}
