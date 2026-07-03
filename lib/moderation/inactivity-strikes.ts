const STRIKES_KEY = "banterbird:inactivityStrikes";
const PAUSED_KEY = "banterbird:matchingPausedInactivity";

export const MAX_INACTIVITY_STRIKES = 3;

export function getInactivityStrikes(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(STRIKES_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function isMatchingPausedForInactivity(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PAUSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setMatchingPausedForInactivity(paused: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (paused) sessionStorage.setItem(PAUSED_KEY, "1");
    else sessionStorage.removeItem(PAUSED_KEY);
  } catch {
    // ignore storage errors
  }
}

/** Record one inactivity skip. Returns new strike count. Sets pause flag at max strikes. */
export function recordInactivitySkip(): number {
  const next = getInactivityStrikes() + 1;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(STRIKES_KEY, String(next));
      if (next >= MAX_INACTIVITY_STRIKES) {
        setMatchingPausedForInactivity(true);
      }
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

export function resetInactivityStrikes(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STRIKES_KEY);
    setMatchingPausedForInactivity(false);
  } catch {
    // ignore storage errors
  }
}

/** @deprecated Use isMatchingPausedForInactivity */
export function hasMaxInactivityStrikes(): boolean {
  return isMatchingPausedForInactivity();
}
