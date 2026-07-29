"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ImagePlus, Send, Trash2, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InlineSpinner } from "@/components/ui/Loading";
import { Avatar } from "./Avatar";
import type { DmMessage, FriendProfile } from "./types";
import {
  uploadChatImage,
  encodeImageMessage,
  isImageMessage,
  extractImageUrl,
} from "@/lib/chat/image-upload";
import { ImageMessage } from "@/components/chat/ImageMessage";

// ── Typing bubble (3-dot bounce) ────────────────────────────────────────────
function TypingBubble() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="flex justify-start"
      aria-live="polite"
      aria-label="Friend is typing"
    >
      <div className="rounded-2xl rounded-bl-sm bg-navy-100 px-4 py-3 dark:bg-navy-800">
        <div className="flex items-center gap-1.5 px-0.5 py-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-navy-400 dark:bg-navy-500"
              animate={{ y: [0, -5, 0], opacity: [0.45, 1, 0.45] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.14,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function DmConversation({
  friend,
  currentUserId,
  supabase,
  onBack,
}: {
  friend: FriendProfile;
  currentUserId: string;
  supabase: SupabaseClient;
  onBack: (roomId: string | null) => void;
}) {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);

  // Hide headers when mobile keyboard is open (visualViewport shrinks)
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const roomIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Image attachment
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  // ── Detect mobile keyboard via visualViewport ──────────────────────────────
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Threshold: if visible height shrinks by more than 120 px vs screen height,
    // we assume the software keyboard is open.
    const THRESHOLD = 120;
    const measure = () => {
      const diff = window.screen.height - vv.height;
      setKeyboardOpen(diff > THRESHOLD);
    };

    measure();
    vv.addEventListener("resize", measure);
    return () => vv.removeEventListener("resize", measure);
  }, []);

  // ── Image helpers ──────────────────────────────────────────────────────────
  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5 MB."); return; }
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Scroll helper ──────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((instant = false) => {
    bottomRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" } as ScrollIntoViewOptions);
  }, []);

  // ── Fetch messages ─────────────────────────────────────────────────────────
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

  // Scroll to bottom when messages load or change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Also scroll when typing bubble appears/disappears
  useEffect(() => {
    if (peerTyping) scrollToBottom();
  }, [peerTyping, scrollToBottom]);

  // ── Realtime: new DM messages ──────────────────────────────────────────────
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

  // ── Realtime: typing broadcast ─────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const bc = supabase
      .channel(`dm:${roomId}:typing`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { userId?: string; active?: boolean };
        // Only show indicator for the peer, not ourselves
        if (!p?.userId || p.userId === currentUserId) return;
        if (p.active) {
          setPeerTyping(true);
          if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
          typingHideTimer.current = setTimeout(() => setPeerTyping(false), 3000);
        } else {
          if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
          setPeerTyping(false);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") typingChannelRef.current = bc;
      });

    return () => {
      if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
      typingChannelRef.current = null;
      void supabase.removeChannel(bc);
    };
  }, [roomId, supabase, currentUserId]);

  // ── Broadcast our own typing state ────────────────────────────────────────
  const sendTypingBroadcast = useCallback((active: boolean) => {
    const ch = typingChannelRef.current;
    if (!ch) return;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: currentUserId, active },
    });
  }, [currentUserId]);

  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.trim()) {
      sendTypingBroadcast(true);
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingStopTimer.current = setTimeout(() => sendTypingBroadcast(false), 1500);
    } else {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      sendTypingBroadcast(false);
    }
  };

  // Clean up typing stop timer on unmount
  useEffect(() => {
    return () => {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      sendTypingBroadcast(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core send ──────────────────────────────────────────────────────────────
  const sendContent = useCallback(async (content: string) => {
    setSending(true);
    setError(null);
    const res = await fetch("/api/dm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId: friend.id, content }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string; message?: DmMessage; roomId?: string;
    };
    setSending(false);
    if (!res.ok) { setError(json.error ?? "Failed to send."); return; }
    const rid = json.roomId;
    if (rid && !roomId) setRoomId(rid);
    const msg = json.message;
    if (msg) {
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
    }
    // Scroll after send regardless of whether realtime fires
    scrollToBottom();
  }, [friend.id, roomId, scrollToBottom]);

  const handleSend = async () => {
    if (sending) return;

    // Stop broadcasting "typing" immediately on send
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    sendTypingBroadcast(false);

    // Send image if one is staged
    if (imageFile) {
      const result = await uploadChatImage(imageFile, supabase, currentUserId);
      if (!result.ok) { setError(result.error); return; }
      clearImage();
      await sendContent(encodeImageMessage(result.url));
      return;
    }

    const content = input.trim();
    if (!content) return;
    setInput("");
    await sendContent(content);
  };

  const canSend = !sending && (imageFile != null || input.trim().length > 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header — always visible, compact on mobile */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-navy-200 px-3 py-2 sm:gap-3 sm:px-4 sm:py-4 dark:border-white/10">
        <button
          type="button"
          onClick={() => onBack(roomIdRef.current)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-navy-500 transition active:scale-95 hover:bg-navy-100 hover:text-navy-900 sm:h-10 sm:w-10 dark:text-navy-400 dark:hover:bg-navy-800 dark:hover:text-navy-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
        <Avatar url={friend.avatar_url} username={friend.username} size="sm" />
        <span className="flex-1 truncate text-sm font-semibold text-navy-950 sm:text-base dark:text-navy-50">
          {friend.username ?? "Unknown"}
        </span>
        {/* Auto-delete badge — only shown when keyboard is up and the notice bar is hidden */}
        {keyboardOpen && (
          <span className="shrink-0 rounded-full border border-rose-300/60 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
            Auto-delete on
          </span>
        )}
      </div>

      {/* Ephemeral notice — hidden when keyboard is open to save space */}
      {!keyboardOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-navy-200/60 bg-rose-500/5 px-3 py-2 sm:px-4 sm:py-2.5 dark:border-white/10">
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-rose-500" />
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Messages are deleted after both parties have read them, or after 30 days.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading && <div className="flex justify-center pt-8"><InlineSpinner /></div>}
        {!loading && messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-navy-400 dark:text-navy-500">
            No messages yet - say hi!
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          const isImg = isImageMessage(msg.content);
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              {isImg ? (
                <ImageMessage url={extractImageUrl(msg.content)} mine={isMe} peerLabel={friend.username ?? "Friend"} />
              ) : (
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[72%] ${
                  isMe
                    ? "rounded-br-sm bg-navy-800 text-white dark:bg-navy-200 dark:text-navy-950"
                    : "rounded-bl-sm bg-navy-100 text-navy-950 dark:bg-navy-800 dark:text-navy-50"
                }`}>
                  {msg.content}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        <AnimatePresence>
          {peerTyping && <TypingBubble key="typing" />}
        </AnimatePresence>

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Image preview strip */}
      {imagePreview && (
        <div className="flex shrink-0 items-center gap-3 border-t border-navy-200/60 px-4 py-3 dark:border-white/10">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Attachment" className="h-16 w-16 rounded-xl object-cover" />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-white dark:bg-white dark:text-navy-950"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm text-navy-500 dark:text-navy-400">Ready to send</p>
        </div>
      )}

      {/* Composer — plain div, no <form>, matching ChatComposer's pattern so
          the browser never triggers a form-submit blur on mobile */}
      <div
        className="flex shrink-0 items-center gap-2 border-t border-navy-200 px-4 py-3 dark:border-white/10"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Image attach button */}
        <button
          type="button"
          disabled={sending}
          onClick={() => fileRef.current?.click()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-navy-200/80 bg-white/70 text-navy-600 transition active:scale-95 hover:bg-white disabled:opacity-40 dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-400 dark:hover:bg-navy-800"
          aria-label="Attach image"
        >
          <ImagePlus className="h-5 w-5" />
        </button>

        {/* Message input */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          disabled={!!imageFile || sending}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={imageFile ? "Image ready - hit send" : "Message..."}
          enterKeyHint="send"
          className="h-11 flex-1 resize-none overflow-hidden rounded-xl border border-navy-200/80 bg-white px-4 py-0 text-base leading-[44px] text-navy-950 placeholder:text-navy-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-400/20 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-navy-50 dark:placeholder:text-navy-500"
          maxLength={2000}
        />

        {/* Send button — onMouseDown/onTouchStart preventDefault stops the browser
            from blurring the textarea, keeping the mobile keyboard up */}
        <button
          type="button"
          disabled={!canSend}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => void handleSend()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white transition active:scale-95 hover:bg-navy-800 disabled:opacity-50 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
          aria-label="Send"
        >
          {sending ? <InlineSpinner className="h-5 w-5" /> : <Send className="h-5 w-5" />}
        </button>
      </div>

      {error && (
        <p className="shrink-0 px-4 pb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}
