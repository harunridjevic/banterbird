/** User-facing copy for network / fetch failures. */
export function networkErrorMessage(err?: unknown): string {
  if (err instanceof TypeError) {
    return "No internet connection. Check your signal and try again.";
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
      return "No internet connection. Check your signal and try again.";
    }
    if (m.includes("timeout") || m.includes("timed out")) {
      return "That took too long. Check your connection and try again.";
    }
    if (m.includes("aborted") || m.includes("abort")) {
      return "The request was interrupted. Please try again.";
    }
  }
  return "Something went wrong on our end. Try again in a moment.";
}

/** Translate raw server / API error strings into something a user can act on. */
export function friendlyApiError(raw: string | undefined | null, fallback = "Something went wrong. Please try again."): string {
  if (!raw) return fallback;
  const m = raw.toLowerCase();

  // Auth / access
  if (m.includes("unauthorized") || m.includes("not authenticated") || m.includes("sign in"))
    return "You need to be signed in to do that.";
  if (m.includes("blocked") || m.includes("restricted") || m.includes("banned"))
    return "Your access has been restricted. Contact support if you think this is a mistake.";
  if (m.includes("vpn") || m.includes("proxy"))
    return "VPN and proxy connections aren't allowed. Disable yours and try again.";

  // Rate limiting
  if (m.includes("slow down") || m.includes("too many") || m.includes("rate limit") || m.includes("burst"))
    return "You're going too fast. Wait a moment and try again.";

  // Chat / room
  if (m.includes("does not exist") || m.includes("not found") || m.includes("no access"))
    return "This chat is no longer available.";
  if (m.includes("not a participant"))
    return "You're not part of this chat.";
  if (m.includes("ended"))
    return "This chat has already ended.";

  // Messaging
  if (m.includes("could not send") || m.includes("message"))
    return "Couldn't send that message. Try again.";

  // Session / connectivity
  if (m.includes("session") || m.includes("expired"))
    return "Your session expired. Refresh the page to continue.";
  if (m.includes("network") || m.includes("fetch") || m.includes("connection"))
    return "No internet connection. Check your signal and try again.";

  // Billing
  if (m.includes("already have") && m.includes("subscription"))
    return "You already have an active PRO subscription.";
  if (m.includes("checkout") || m.includes("payment"))
    return "Something went wrong with the payment. Try again or contact support.";

  return fallback;
}
