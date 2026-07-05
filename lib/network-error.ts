/** User-facing copy for network / fetch failures. */
export function networkErrorMessage(err?: unknown): string {
  if (err instanceof TypeError) return "oops, you disconnected";
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) {
      return "oops, you disconnected";
    }
  }
  return "oops, you disconnected";
}
