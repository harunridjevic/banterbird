/** User-facing copy for network / fetch failures. */
export function networkErrorMessage(err?: unknown): string {
  if (err instanceof TypeError) {
    // TypeError is what browsers throw for "Failed to fetch" (offline, CORS, DNS failure).
    return "Connection lost. Check your internet and try again.";
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (
      m.includes("failed to fetch") ||
      m.includes("networkerror") ||
      m.includes("network request failed") ||
      m.includes("load failed") ||
      m.includes("network")
    ) {
      return "Connection lost. Check your internet and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}
