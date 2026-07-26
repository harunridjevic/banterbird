"use client";

import { useEffect, useState } from "react";
import { UserPlus, Check } from "lucide-react";
import { useAccount } from "@/lib/account/context";
import { InlineSpinner } from "@/components/ui/Loading";

type Status = "idle" | "loading" | "sent" | "already_friends" | "error";

/**
 * Shown in the chat header for signed-in users.
 * - Human rooms: sends a real friend request that the other person can accept.
 * - Bot rooms: sends a request that is stored but the bot never accepts it.
 *   The button looks identical either way.
 */
export function FriendRequestButton({
  peerId,
  isAiRoom,
}: {
  peerId: string | null;
  isAiRoom: boolean;
}) {
  const { state } = useAccount();
  const [status, setStatus] = useState<Status>("idle");
  const [tooltip, setTooltip] = useState<string | null>(null);

  useEffect(() => {
    if (!tooltip) return;
    const t = setTimeout(() => setTooltip(null), 3500);
    return () => clearTimeout(t);
  }, [tooltip]);

  // Only show for signed-in users
  // For AI rooms show even without a real peerId (we'll show "sent" state
  // but won't actually POST if there's no target)
  if (state.status !== "named") return null;
  if (!isAiRoom && !peerId) return null;

  const isSent = status === "sent" || status === "already_friends";

  const handleClick = async () => {
    if (isSent || status === "loading") return;

    // If AI room and no peerId there's nobody to send to — just show feedback
    if (isAiRoom && !peerId) {
      setStatus("sent");
      setTooltip("Request sent! Bots don't accept requests, but it's noted.");
      return;
    }

    setStatus("loading");
    const res = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };

    if (res.status === 409) {
      setStatus("already_friends");
      return;
    }
    if (!res.ok) {
      setStatus("error");
      setTooltip(json.error ?? "Failed to send request.");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setStatus("sent");
    if (isAiRoom) {
      setTooltip("Request sent! Bots don't accept requests though.");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={status === "loading" || isSent}
        aria-label={isSent ? "Friend request sent" : "Send friend request"}
        className={`inline-flex items-center gap-1 rounded-2xl border px-2.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${
          isSent
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : "border-navy-200/70 bg-white/70 text-navy-700 hover:border-navy-300 hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800"
        }`}
      >
        {status === "loading" ? (
          <InlineSpinner className="h-3.5 w-3.5" />
        ) : isSent ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <UserPlus className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">
          {isSent
            ? status === "already_friends"
              ? "Friends"
              : "Requested"
            : "Add"}
        </span>
      </button>

      {tooltip && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-max max-w-[200px] rounded-xl border border-navy-200/70 bg-white px-3 py-2 text-xs text-navy-700 shadow-lg dark:border-white/10 dark:bg-navy-900 dark:text-navy-300">
          {tooltip}
        </div>
      )}
    </div>
  );
}
