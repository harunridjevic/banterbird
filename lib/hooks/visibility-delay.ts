/**
 * Wall-clock delay. Keeps counting while the tab is hidden or the app is backgrounded
 * (timers may be throttled, but elapsed time catches up when the tab wakes).
 */
export async function delayMs(totalMs: number, shouldAbort?: () => boolean): Promise<void> {
  const deadline = Date.now() + totalMs;
  while (true) {
    if (shouldAbort?.()) {
      throw new Error("aborted");
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(remaining, 280)));
  }
}
