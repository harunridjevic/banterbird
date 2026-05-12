"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { MessageRow } from "@/lib/types/chat";

type Props = {
  messages: MessageRow[];
  selfId: string;
  peerTyping?: boolean;
};

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
      aria-label="Stranger is typing"
    >
      <div className="relative max-w-[85%] rounded-3xl rounded-bl-lg bg-[var(--color-bubble-them)] px-4 py-3 shadow-sm sm:max-w-[70%]">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
          Stranger
        </span>
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

export function MessageList({ messages, selfId, peerTyping = false }: Props) {
  return (
    <div className="flex flex-col gap-3 px-3 py-4 sm:px-4">
      {messages.map((m, i) => {
        const mine = m.user_id === selfId;
        return (
          <motion.div
            key={m.id}
            layout
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 28, delay: i === messages.length - 1 ? 0 : 0 }}
            className={`flex ${mine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`relative max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-snug shadow-sm sm:max-w-[70%] ${
                mine
                  ? "rounded-br-lg bg-[var(--color-bubble-me)] text-white"
                  : "rounded-bl-lg bg-[var(--color-bubble-them)] text-navy-950 dark:text-navy-50"
              }`}
            >
              {!mine ? (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
                  Stranger
                </span>
              ) : null}
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          </motion.div>
        );
      })}
      <AnimatePresence>{peerTyping ? <TypingBubble key="typing" /> : null}</AnimatePresence>
    </div>
  );
}
