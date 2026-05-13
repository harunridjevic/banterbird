function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Pause before we even ask the model — simulates reading what you wrote. */
export function readDelayBeforeReplyMs(userMessageLen: number) {
  const base = 520 + Math.random() * 2200;
  const perChar = userMessageLen * (10 + Math.random() * 24);
  return clamp(Math.round(base + perChar), 320, 4800);
}

export function readDelayOpenerMs() {
  return clamp(Math.round(480 + Math.random() * 1700), 350, 2600);
}

/** After the reply is known — sometimes a short think before fingers move. */
export async function preTypingHesitation() {
  if (Math.random() < 0.45) {
    await sleep(Math.round(80 + Math.random() * 420));
    return;
  }
  await sleep(Math.round(280 + Math.random() * 900));
  if (Math.random() < 0.22) {
    await sleep(Math.round(650 + Math.random() * 1400));
  }
}

/** How long to show "typing" — scales with length, with jitter. */
export function typingDurationForReply(reply: string) {
  const len = reply.length;
  const msPerChar = 28 + Math.random() * 64;
  const wave = Math.sin(len * 0.13) * 180;
  return clamp(Math.round(len * msPerChar + wave + Math.random() * 520), 550, 15500);
}

export async function runHumanlikeTyping(
  setTyping: (v: boolean) => void,
  totalMs: number,
  replyLen: number,
) {
  setTyping(true);
  const longEnough = totalMs >= 1400 && replyLen >= 14;
  const breaks =
    longEnough && Math.random() < 0.5 ? 1 + (Math.random() < 0.28 ? 1 : 0) : 0;

  if (breaks === 0) {
    await sleep(totalMs);
  } else {
    let remaining = totalMs;
    for (let b = 0; b <= breaks; b++) {
      const isLast = b === breaks;
      const seg = isLast ? Math.max(0, remaining) : Math.max(380, Math.floor(remaining * (0.28 + Math.random() * 0.42)));
      remaining -= seg;
      await sleep(seg);
      if (!isLast) {
        setTyping(false);
        await sleep(Math.round(140 + Math.random() * 760));
        setTyping(true);
      }
    }
  }
  setTyping(false);
}