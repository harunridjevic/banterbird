"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus, Check } from "lucide-react";
import { useAccount } from "@/lib/account/context";
import { InlineSpinner } from "@/components/ui/Loading";
import { AccountNudge } from "@/components/account/AccountNudge";

type Status = "idle" | "loading" | "sent" | "already_friends" | "error";

export function FriendRequestButton({
  peerId,
  isAiRoom,
  hideBotUi = false,
}: {
  peerId: string | null;
  isAiRoom: boolean;
  hideBotUi?: boolean;
}) {
  const { state } = useAccount();
  const [status, setStatus] = useState<Status>("idle");
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showNudge, setShowNudge] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isAnonymous = state.status === "anonymous" || state.status === "loading";

  useEffect(() => {
    if (!tooltip) return;
    const t = setTimeout(() => setTooltip(null), 3000);
    return () => clearTimeout(t);
  }, [tooltip]);

  // Always render for signed-in users; for anon users render but intercept click
  if (!isAiRoom && !peerId && state.status === "named") return null;
  if (!isAiRoom && !peerId && isAnonymous) return null;

  const isSent = status === "sent" || status === "already_friends";

  const handleClick = async () => {
    if (isSent || status === "loading") return;

    if (isAiRoom) {
      // Anonymous users see the sign-in nudge, but we still write system messages
      // so the chat reflects what happened (same as a named user's experience).
      if (isAnonymous) setShowNudge(true);
      setStatus("sent");
      // Always dispatch events — ChatRoom injects them into local message state.
      // hideBotUi only hides the "Bot" label; it shouldn't suppress friend-request messages.
      const delay = 4000 + Math.random() * 2000; // 4–6s
      const excuses = [
        "Sorry, I don't really add people on here tbh",
        "I keep my friends list pretty private lol",
        "Not really looking to connect outside of chat",
        "I prefer to keep things anonymous on BanterBird",
        "Nothing personal, I just don't add people from chat",
        "I never really use the friends thing on here lol",
        "I'm kind of weird about adding people I just met in chat",
      ];
      const excuse = excuses[Math.floor(Math.random() * excuses.length)];
      window.dispatchEvent(new CustomEvent("banterbird:bot-friend-request-sent"));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("banterbird:bot-friend-request-rejected", {
          detail: { excuse },
        }));
      }, delay);
      return;
    }

    // Anonymous — show nudge for real friend requests
    if (isAnonymous) {
      setShowNudge(true);
      return;
    }

    setStatus("loading");
    const res = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };

    if (res.status === 409) { setStatus("already_friends"); return; }
    if (!res.ok) {
      setStatus("error");
      setTooltip(json.error ?? "Failed to send request.");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setStatus("sent");
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => void handleClick()}
        disabled={status === "loading" || isSent}
        aria-label={
          isAnonymous ? "Sign in to add friends"
          : isSent ? "Friend request sent"
          : "Send friend request"
        }
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
        {/* Fixed-width span so text changes don't shift surrounding elements */}
        <span className="hidden w-[4.5rem] text-center sm:inline">
          {isSent
            ? status === "already_friends" ? "Friends" : "Requested"
            : "Add"}
        </span>
      </button>

      {/* Anonymous nudge — rendered via portal, positioned below button */}
      <AccountNudge
        visible={showNudge}
        onDismiss={() => setShowNudge(false)}
        message="Create a free account to add friends."
        triggerRef={buttonRef}
        preferBelow={true}
      />

      {/* Sent/error tooltip */}
      {tooltip && !showNudge && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-max max-w-[200px] rounded-xl border border-navy-200/70 bg-white px-3 py-2 text-xs text-navy-700 shadow-lg dark:border-white/10 dark:bg-navy-900 dark:text-navy-300">
          {tooltip}
        </div>
      )}
    </div>
  );
}
