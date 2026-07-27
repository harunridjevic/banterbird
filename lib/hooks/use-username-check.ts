"use client";

import { useEffect, useState } from "react";

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

/**
 * Debounced real-time username availability check.
 * Returns a status and a human-readable message.
 */
export function useUsernameCheck(
  username: string,
  currentUsername?: string | null,
): { status: Status; message: string | null } {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = username.trim();

    // Reset when empty
    if (!trimmed) { setStatus("idle"); setMessage(null); return; }

    // Skip check if it's the same as their current username
    if (currentUsername && trimmed.toLowerCase() === currentUsername.toLowerCase()) {
      setStatus("idle"); setMessage(null); return;
    }

    // Instant format validation
    if (trimmed.length < 3) {
      setStatus("invalid"); setMessage("At least 3 characters required.");
      return;
    }
    if (!USERNAME_RE.test(trimmed)) {
      setStatus("invalid"); setMessage("Letters, numbers and underscores only.");
      return;
    }

    setStatus("checking");
    setMessage(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmed }),
        });
        const json = (await res.json()) as { available: boolean };
        if (json.available) {
          setStatus("available");
          setMessage("Username is available.");
        } else {
          setStatus("taken");
          setMessage("Username is already taken.");
        }
      } catch {
        setStatus("idle");
        setMessage(null);
      }
    }, 450); // debounce 450ms

    return () => clearTimeout(timer);
  }, [username, currentUsername]);

  return { status, message };
}
