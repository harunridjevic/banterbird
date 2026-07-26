"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { Avatar } from "./Avatar";
import type { DmMessage, FriendProfile } from "./types";

export function DmConversation({
  friend,
  currentUserId,
  supabase,
  onBack,
}: {
  friend: FriendProfile;
  currentUserId: string;
  supabase: SupabaseClient;
  /** Called with the roomId so the parent can delete messages on close */
  onBack: (roomId: string | null) => void;
}) {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Keep roomId in a ref so the back handler always has the latest value
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const fetchMessages = useCallback(async (rid: string) => {
    const res = await fetch(`/api/dm/messages?roomId=${rid}`);
    if (!res.ok) return;
    const data = (await res.json()) as { messages: DmMessage[] };
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data: rid, error: rpcErr } = await supabase.rpc("get_or_create_dm_room", {
        p_other_id: friend.id,
      });
      if (cancelled) return;
      if (rpcErr || !rid) { setLoading(false); return; }
      setRoomId(rid as string);
      await fetchMessages(rid as string);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [friend.id, supabase, fetchMessages]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime for incoming messages
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`dm:${roomId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        const msg = payload.new as DmMessage;
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [roomId, supabase]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);

    const res = await fetch("/api/dm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId: friend.id, content }),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string; message?: DmMessage; roomId?: string };
    setSending(false);

    if (!res.ok) { setError(json.error ?? "Failed to send."); return; }
    setInput("");
    const rid = json.roomId;
    if (rid && !roomId) setRoomId(rid);
    const msg = json.message;
    if (msg) setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-navy-200 px-4 py-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => onBack(roomIdRef.current)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100 hover:text-navy-900 dark:text-navy-400 dark:hover:bg-navy-800 dark:hover:text-navy-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar url={friend.avatar_url} username={friend.username} size="sm" />
        <span className="flex-1 truncate text-sm font-semibold text-navy-950 dark:text-navy-50">
          {friend.username ?? "Unknown"}
        </span>
      </div>

      {/* Ephemeral notice */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-navy-200/60 bg-rose-500/5 px-4 py-2 dark:border-white/10">
        <Trash2 className="h-3 w-3 shrink-0 text-rose-500" />
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          All messages are deleted when you close this conversation.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading && <div className="flex justify-center pt-6"><InlineSpinner /></div>}
        {!loading && messages.length === 0 && (
          <p className="pt-8 text-center text-xs text-navy-400 dark:text-navy-500">
            No messages yet — say hi!
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                isMe
                  ? "rounded-br-sm bg-navy-800 text-white dark:bg-navy-200 dark:text-navy-950"
                  : "rounded-bl-sm bg-navy-100 text-navy-950 dark:bg-navy-800 dark:text-navy-50"
              }`}>
                {msg.content}
                {isMe && !msg.read_at && (
                  <span className="ml-1.5 text-[10px] opacity-40">●</span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="flex shrink-0 items-end gap-2 border-t border-navy-200 px-4 py-3 dark:border-white/10"
      >
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(e); }
          }}
          placeholder="Message…"
          className="flex-1 resize-none rounded-xl border border-navy-200/80 bg-white px-3 py-2 text-sm text-navy-950 placeholder:text-navy-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-400/20 dark:border-white/10 dark:bg-navy-900 dark:text-navy-50 dark:placeholder:text-navy-500"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white transition hover:bg-navy-800 disabled:opacity-50 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
          aria-label="Send"
        >
          {sending ? <InlineSpinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
      {error && <p className="shrink-0 px-4 pb-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
