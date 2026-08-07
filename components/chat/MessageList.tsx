"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { MessageRow } from "@/lib/types/chat";
import { isImageMessage, extractImageUrl } from "@/lib/chat/image-upload";
import { ImageMessage } from "./ImageMessage";

type Props = {
  messages: MessageRow[];
  selfId: string;
  peerTyping?: boolean;
  peerIsBot?: boolean;
  peerIsPro?: boolean;
  peerLabel?: string;
};

function TypingBubble({ label }: { label: string }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="flex justify-start"
      aria-live="polite"
      aria-label={`${label} is typing`}
    >
      <div className="relative max-w-[85%] rounded-3xl rounded-bl-lg bg-[var(--color-bubble-them)] px-4 py-3 text-navy-950 shadow-sm sm:max-w-[70%] dark:text-navy-50">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-navy-700 dark:text-navy-400">
          {label}
        </span>
        <div className="flex items-center gap-1.5 px-0.5 py-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-navy-400 dark:bg-navy-500"
              animate={{ y: [0, -5, 0], opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function MessageList({
  messages,
  selfId,
  peerTyping = false,
  peerIsBot = false,
  peerIsPro = false,
  peerLabel = "Stranger",
}: Props) {
  return (
    <div className="flex flex-col gap-3 px-3 py-4 sm:px-4">
      {messages.map((m) => {
        const mine = !m.is_from_ai && m.user_id === selfId;
        const isImg = isImageMessage(m.content);
        const isSystem = m.content.startsWith("[system]");

        // System messages (friend request notifications etc.)
        if (isSystem) {
          const text = m.content.slice("[system]".length);
          return (
            <motion.div
              key={m.clientKey ?? m.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex justify-center"
            >
              <span className="rounded-full border border-navy-200/60 bg-navy-100/60 px-3 py-1 text-[11px] text-navy-600 dark:border-white/10 dark:bg-navy-800/50 dark:text-navy-400">
                {text}
              </span>
            </motion.div>
          );
        }

        return (
          <motion.div
            key={m.clientKey ?? m.id}
            layout
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className={`flex ${mine ? "justify-end" : "justify-start"}`}
          >
            {isImg ? (
              /* ── Image bubble ── */
              <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]">
                {!mine && (
                  <span className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-navy-700 dark:text-navy-400">
                    <span>{peerIsBot && m.is_from_ai ? `${peerLabel} · AI` : peerLabel}</span>
                    {peerIsBot && peerIsPro && m.is_from_ai && (
                      <span className="rounded border border-amber-400/60 bg-amber-400/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-400/30 dark:bg-transparent dark:text-amber-400">
                        Pro user
                      </span>
                    )}
                  </span>
                )}
                <ImageMessage
                  url={extractImageUrl(m.content)}
                  mine={mine}
                  peerLabel={peerLabel}
                />
              </div>
            ) : (
              /* ── Text bubble ── */
              <div
                className={`relative max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-snug shadow-sm sm:max-w-[70%] ${
                  mine
                    ? "rounded-br-lg bg-[var(--color-bubble-me)] text-white"
                    : `rounded-bl-lg text-navy-950 dark:text-navy-50 ${
                        peerIsBot && m.is_from_ai
                          ? "border border-violet-400/35 bg-violet-50/90 dark:border-violet-500/25 dark:bg-violet-950/35"
                          : "bg-[var(--color-bubble-them)]"
                      }`
                }`}
              >
                {!mine && (
                  <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-navy-700 dark:text-navy-400">
                    <span>{peerIsBot && m.is_from_ai ? `${peerLabel} · AI` : peerLabel}</span>
                    {peerIsBot && peerIsPro && m.is_from_ai && (
                      <span className="rounded border border-amber-400/60 bg-amber-400/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-400/30 dark:bg-transparent dark:text-amber-400">
                        Pro user
                      </span>
                    )}
                  </span>
                )}
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            )}
          </motion.div>
        );
      })}
      <AnimatePresence>
        {peerTyping ? <TypingBubble key="typing" label={peerLabel} /> : null}
      </AnimatePresence>
    </div>
  );
}
