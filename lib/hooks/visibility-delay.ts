/** Promise that resolves when the tab becomes visible again. */
export function waitUntilVisible(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onVisible = () => {
      if (document.visibilityState === "hidden") return;
      document.removeEventListener("visibilitychange", onVisible);
      resolve();
    };
    document.addEventListener("visibilitychange", onVisible);
  });
}

/**
 * Delay that pauses while the tab is hidden (mobile background).
 * Does not count background time toward the delay.
 */
export async function delayMs(totalMs: number, shouldAbort?: () => boolean): Promise<void> {
  let remaining = totalMs;
  while (remaining > 0) {
    if (shouldAbort?.()) {
      throw new Error("aborted");
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      await waitUntilVisible();
      continue;
    }
    const step = Math.min(remaining, 280);
    await new Promise<void>((resolve) => window.setTimeout(resolve, step));
    remaining -= step;
  }
}
