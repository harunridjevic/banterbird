"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, ChevronRight, MessageCircle, UserMinus, UserPlus, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { Avatar } from "./Avatar";
import { DmConversation } from "./DmConversation";
import type { FriendEntry, FriendProfile, IncomingRequest } from "./types";

type View = "list" | "dm";

/** Per-friend unread count map: friendId → count */
type UnreadMap = Record<string, number>;

export function FriendsPanel({
  currentUserId,
  supabase,
  onClose,
  onNotifClear,
}: {
  currentUserId: string;
  supabase: SupabaseClient;
  onClose: () => void;
  onNotifClear?: () => void;
}) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [unread, setUnread] = useState<UnreadMap>({});
  const [loading, setLoading] = useState(true);

  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  const [view, setView] = useState<View>("list");
  const [activeFriend, setActiveFriend] = useState<FriendProfile | null>(null);

  // ── Load friends + requests ──────────────────────────────────
  const loadList = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/friends/list");
    if (res.ok) {
      const data = (await res.json()) as { friends: FriendEntry[]; incoming: IncomingRequest[] };
      setFriends(data.friends);
      setIncoming(data.incoming);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — never changes

  // Clear the Navbar badge after the first successful load
  useEffect(() => {
    if (!loading) onNotifClear?.();
  // only run when loading transitions from true→false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => { void loadList(); }, [loadList]);

  // ── Realtime: friend_requests → new incoming badge ───────────
  useEffect(() => {
    const channel = supabase
      .channel(`notif:friend_requests:${currentUserId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "friend_requests",
        filter: `to_id=eq.${currentUserId}`,
      }, () => { void loadList(); })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "friend_requests",
        filter: `from_id=eq.${currentUserId}`,
      }, () => { void loadList(); }) // accepted → add to friends
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, supabase, loadList]);

  // ── Realtime: dm_messages → unread badge per friend ──────────
  useEffect(() => {
    if (friends.length === 0) return;
    const channel = supabase
      .channel(`notif:dm_messages:${currentUserId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
      }, (payload) => {
        const msg = payload.new as { sender_id: string; room_id: string };
        if (msg.sender_id === currentUserId) return; // own messages
        // Find which friend sent this (by matching sender_id to friend list)
        const friend = friends.find((f) => f.friend_id === msg.sender_id);
        if (!friend) return;
        // Only bump if not currently in that DM
        if (view === "dm" && activeFriend?.id === msg.sender_id) return;
        setUnread((prev) => ({
          ...prev,
          [msg.sender_id]: (prev[msg.sender_id] ?? 0) + 1,
        }));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, supabase, friends, view, activeFriend]);

  // ── Add friend ───────────────────────────────────────────────
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = addUsername.trim();
    if (!username) return;
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(false);
    const res = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setAddLoading(false);
    if (!res.ok) { setAddError(json.error ?? "Failed to send request."); return; }
    setAddSuccess(true);
    setAddUsername("");
    setTimeout(() => setAddSuccess(false), 3000);
  };

  // ── Respond to friend request ─────────────────────────────────
  const handleRespond = async (requestId: string, action: "accept" | "decline") => {
    const res = await fetch("/api/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
    });
    if (res.ok) void loadList();
  };

  // ── Unfriend ──────────────────────────────────────────────────
  const handleUnfriend = async (friendId: string) => {
    await fetch("/api/friends/unfriend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId }),
    });
    void loadList();
  };

  // ── Open DM ───────────────────────────────────────────────────
  const openDm = (friend: FriendProfile) => {
    // Clear unread badge when opening
    setUnread((prev) => { const n = { ...prev }; delete n[friend.id]; return n; });
    setActiveFriend(friend);
    setView("dm");
  };

  // ── Close DM — delete all messages ────────────────────────────
  const handleDmBack = useCallback(async (roomId: string | null) => {
    if (roomId) {
      await fetch("/api/dm/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
    }
    setView("list");
    setActiveFriend(null);
  }, []);

  // ── DM view ───────────────────────────────────────────────────
  if (view === "dm" && activeFriend) {
    return (
      <DmConversation
        friend={activeFriend}
        currentUserId={currentUserId}
        supabase={supabase}
        onBack={handleDmBack}
      />
    );
  }

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const totalNotif = incoming.length + totalUnread;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {totalNotif > 0 && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/8 px-3 py-2.5">
          <Bell className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-xs font-medium text-amber-800 dark:text-amber-300">
            {incoming.length > 0 && totalUnread > 0
              ? `${incoming.length} friend request${incoming.length > 1 ? "s" : ""} · ${totalUnread} new message${totalUnread > 1 ? "s" : ""}`
              : incoming.length > 0
                ? `${incoming.length} friend request${incoming.length > 1 ? "s" : ""}`
                : `${totalUnread} new message${totalUnread > 1 ? "s" : ""}`}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5 px-4 py-4">
        {/* ── Incoming friend requests ── */}
        {incoming.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
              Friend requests · {incoming.length}
            </p>
            <ul className="space-y-2">
              {incoming.map((req) => (
                <li key={req.id} className="flex items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-amber-400/5 px-3 py-2.5 dark:border-amber-400/20 dark:bg-amber-400/5">
                  <Avatar url={req.profiles.avatar_url} username={req.profiles.username} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium text-navy-900 dark:text-navy-100">
                    {req.profiles.username ?? "Unknown"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRespond(req.id, "accept")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 transition hover:bg-emerald-500/30 dark:text-emerald-400"
                    aria-label="Accept"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRespond(req.id, "decline")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-navy-400 transition hover:bg-rose-500/10 hover:text-rose-600 dark:text-navy-500 dark:hover:text-rose-400"
                    aria-label="Decline"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Add friend ── */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
            Add friend
          </p>
          <form onSubmit={handleAddFriend} className="flex gap-2">
            <input
              type="text"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              placeholder="Enter username…"
              autoComplete="off"
              className="flex-1 rounded-xl border border-navy-200/80 bg-white px-3 py-2 text-sm text-navy-950 placeholder:text-navy-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-400/20 dark:border-white/10 dark:bg-navy-900 dark:text-navy-50 dark:placeholder:text-navy-500"
            />
            <button
              type="submit"
              disabled={addLoading || !addUsername.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white transition hover:bg-navy-800 disabled:opacity-50 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
              aria-label="Send friend request"
            >
              {addLoading ? <InlineSpinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            </button>
          </form>
          <AnimatePresence>
            {addError && (
              <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-1.5 rounded-lg border border-rose-500/20 bg-rose-500/8 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-400">
                {addError}
              </motion.p>
            )}
            {addSuccess && (
              <motion.p key="ok" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                Friend request sent!
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        {/* ── Friends list ── */}
        <section className="flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
            Friends{friends.length > 0 ? ` · ${friends.length}` : ""}
          </p>
          {loading ? (
            <div className="flex justify-center py-8"><InlineSpinner /></div>
          ) : friends.length === 0 ? (
            <p className="py-6 text-center text-xs text-navy-400 dark:text-navy-500">
              No friends yet — add someone by username above.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {friends.map((f) => {
                const badge = unread[f.friend_id] ?? 0;
                return (
                  <li key={f.friend_id}>
                    <button
                      type="button"
                      onClick={() => openDm(f.profiles)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-navy-200/60 bg-white px-3 py-2.5 text-left transition hover:border-navy-300 hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:hover:border-white/20 dark:hover:bg-navy-800"
                    >
                      <Avatar url={f.profiles.avatar_url} username={f.profiles.username} />
                      <span className="flex-1 truncate text-sm font-medium text-navy-900 dark:text-navy-100">
                        {f.profiles.username ?? "Unknown"}
                      </span>
                      {badge > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : (
                        <MessageCircle className="h-4 w-4 text-navy-300 transition group-hover:text-navy-600 dark:text-navy-600 dark:group-hover:text-navy-300" />
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-navy-300 dark:text-navy-600" />
                    </button>
                    {/* Unfriend — shown discretely on hover via a separate row */}
                    <div className="flex justify-end px-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => void handleUnfriend(f.friend_id)}
                        className="text-[10px] text-navy-300 transition hover:text-rose-500 dark:text-navy-600 dark:hover:text-rose-400"
                        aria-label={`Unfriend ${f.profiles.username ?? "friend"}`}
                      >
                        unfriend
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
