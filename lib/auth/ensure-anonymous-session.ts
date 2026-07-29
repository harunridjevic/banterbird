import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

export type EnsureSessionResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

const RATE_LIMIT_COOLDOWN_MS = 60_000;

let inFlight: Promise<EnsureSessionResult> | null = null;
let rateLimitedUntil = 0;

function isRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("rate limit") || m.includes("too many requests");
}

function isInvalidSessionError(error: AuthError | null): boolean {
  if (!error) return false;
  const m = error.message.toLowerCase();
  return (
    error.status === 401 ||
    error.status === 403 ||
    m.includes("invalid") ||
    m.includes("expired") ||
    m.includes("does not exist") ||
    m.includes("user not found") ||
    m.includes("jwt")
  );
}

function isNetworkError(error: AuthError | null): boolean {
  if (!error) return false;
  const m = error.message.toLowerCase();
  return m.includes("failed to fetch") || m.includes("network");
}

/** DB rejected auth.uid() - common after ops reset deletes auth users while tabs stay open. */
export function isStaleUserDbError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("foreign key constraint") ||
    m.includes("user_heartbeats_user_id_fkey") ||
    m.includes("violates foreign key")
  );
}

async function signInFresh(client: SupabaseClient): Promise<EnsureSessionResult> {
  if (Date.now() < rateLimitedUntil) {
    const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    return {
      ok: false,
      error: `Auth rate limit reached. Wait ${waitSec}s and refresh the page.`,
    };
  }

  await client.auth.signOut({ scope: "local" });

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    const message =
      error?.message ??
      "Anonymous sign-in failed.";
    if (isRateLimitError(message)) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    }
    return { ok: false, error: message };
  }

  return { ok: true, userId: data.user.id };
}

async function ensureAnonymousSessionInner(
  client: SupabaseClient,
): Promise<EnsureSessionResult> {
  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session?.user) {
    return signInFresh(client);
  }

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();

  if (user && !userErr) {
    return { ok: true, userId: user.id };
  }

  if (userErr && isNetworkError(userErr)) {
    return { ok: false, error: "oops, you disconnected" };
  }

  if (userErr && !isInvalidSessionError(userErr)) {
    return { ok: false, error: userErr.message };
  }

  return signInFresh(client);
}

/** Validate or create one anonymous session. Concurrent callers share a single attempt. */
export async function ensureAnonymousSession(
  client: SupabaseClient,
): Promise<EnsureSessionResult> {
  if (inFlight) return inFlight;

  inFlight = ensureAnonymousSessionInner(client).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Lightweight check - does not trigger sign-in. */
export async function hasAuthenticatedSession(client: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await client.auth.getSession();
  return Boolean(session?.user?.id);
}

export function formatAuthError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string };
    if (e.message) {
      const m = e.message.toLowerCase();
      if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) {
        return "oops, you disconnected";
      }
      return e.message;
    }
    if (e.code) return e.code;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown auth error";
    }
  }
  return String(error);
}
