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

/** After the reply is known — sometimes a short think before fingers move. */
export async function preTypingHesitation(
  timing: TimingScale = {},
  shouldAbort?: () => boolean,
) {
  const s = timing.typingScale ?? 1;
  if (Math.random() < 0.45) {
    await delayMs(scale(80 + Math.random() * 420, s), shouldAbort);
    return;
  }
  await delayMs(scale(280 + Math.random() * 900, s), shouldAbort);
  if (Math.random() < 0.22) {
    await delayMs(scale(650 + Math.random() * 1400, s), shouldAbort);
  }
}

/** How long to show "typing" — scales with length, with jitter. */
export function typingDurationForReply(reply: string, timing: TimingScale = {}) {
  const s = timing.typingScale ?? 1;
  const len = reply.length;
  const msPerChar = 28 + Math.random() * 64;
  const wave = Math.sin(len * 0.13) * 180;
  return clamp(scale(len * msPerChar + wave + Math.random() * 520, s), 400, 18_000);
}

export async function runHumanlikeTyping(
  setTyping: (v: boolean) => void,
  totalMs: number,
  replyLen: number,
  shouldAbort?: () => boolean,
) {
  setTyping(true);
  const longEnough = totalMs >= 1400 && replyLen >= 14;
  const breaks =
    longEnough && Math.random() < 0.5 ? 1 + (Math.random() < 0.28 ? 1 : 0) : 0;

  try {
    if (breaks === 0) {
      await delayMs(totalMs, shouldAbort);
    } else {
      let remaining = totalMs;
      for (let b = 0; b <= breaks; b++) {
        const isLast = b === breaks;
        const seg = isLast
          ? Math.max(0, remaining)
          : Math.max(380, Math.floor(remaining * (0.28 + Math.random() * 0.42)));
        remaining -= seg;
        await delayMs(seg, shouldAbort);
        if (!isLast) {
          setTyping(false);
          await delayMs(Math.round(140 + Math.random() * 760), shouldAbort);
          setTyping(true);
        }
      }
    }
  } finally {
    setTyping(false);
  }
}
