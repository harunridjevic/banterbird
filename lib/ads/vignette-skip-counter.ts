/**
 * Monetag vignette ad gating — shared session-scoped state.
 *
 * Rules:
 *  - Show a vignette after every 3rd chat skip.
 *  - After each vignette, start a 5-minute cooldown before the next one.
 *  - Never show while in an active chat (caller's responsibility to gate on isMatching).
 *  - If the vignette script fails, continue matchmaking normally.
 */

const SKIPS_PER_VIGNETTE = 4;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

let skipCount = 0;
let lastShownAt = 0; // epoch ms

/** Call once each time the user skips a chat. Returns true when a vignette should be shown. */
export function recordSkipAndCheckVignette(): boolean {
  skipCount += 1;

  if (skipCount < SKIPS_PER_VIGNETTE) return false;

  const now = Date.now();
  if (now - lastShownAt < COOLDOWN_MS) return false;

  // Threshold met and cooldown elapsed — reset counter, record time.
  skipCount = 0;
  lastShownAt = now;
  return true;
}

/** Reset skip count (e.g. on page unload / session reset). Does not reset cooldown. */
export function resetSkipCount() {
  skipCount = 0;
}
