"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ChatMessage } from "@/lib/ops/video-generator-types";

interface Props {
  visibleMessages: ChatMessage[];
  strangerTyping?: boolean;
  choicesVisible?: boolean;
  instantTransitions?: boolean;
  slowFactor?: number;
  typingKey?: string;
}

function TypingDots({ instant, slow }: { instant: boolean; slow: number }) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2.5 w-2.5 rounded-full bg-[#7a8bad]"
          animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
          transition={instant ? { duration: 0 } : {
            duration: 0.7 * slow,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.18 * slow,
          }}
        />
      ))}
    </div>
  );
}

export function VideoTemplate({
  visibleMessages,
  strangerTyping = false,
  choicesVisible = false,
  instantTransitions = false,
  slowFactor = 1,
  typingKey = "typing",
}: Props) {
  const s = slowFactor;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: "#0c121c" }}>

      {/* ── Dynamic background — shifts when choices active ── */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={instantTransitions ? {} : {
          opacity: choicesVisible ? 1 : 0,
        }}
        transition={instantTransitions ? { duration: 0 } : { type: "tween", duration: 0.8 * s, ease: "easeInOut" }}
        style={{
          background: "linear-gradient(180deg, #0a0f1e 0%, #0c121c 40%, #080d1a 100%)",
        }}
      />

      {/* Subtle violet ambient top glow */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        animate={instantTransitions ? {} : {
          opacity: choicesVisible ? 0.35 : 0.1,
        }}
        transition={instantTransitions ? { duration: 0 } : { type: "tween", duration: 1 * s, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(124,58,237,0.25) 0%, transparent 100%)",
        }}
      />

      {/* ── Status bar ── */}
      <div className="flex shrink-0 items-center justify-between px-6 pt-3 pb-1">
        <span className="text-[11px] font-semibold tabular-nums text-[#a8b5cc]">9:41</span>
        <div className="flex items-center gap-1.5">
          <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={i * 4.5} y={12 - (i + 1) * 3} width="3" height={(i + 1) * 3} rx="0.5" fill={i < 3 ? "#a8b5cc" : "#2d3a52"} />
            ))}
          </svg>
          <svg width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden>
            <rect x="0.5" y="0.5" width="18" height="11" rx="2.5" stroke="#a8b5cc" />
            <rect x="19.5" y="3.5" width="2" height="5" rx="1" fill="#a8b5cc" />
            <rect x="1.5" y="1.5" width="12" height="9" rx="1.5" fill="#a8b5cc" />
          </svg>
        </div>
      </div>

      {/* ── Chat header ── */}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        {/* Avatar with pulse ring */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2d3a52]">
          {/* Pulse ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: "2px solid rgba(167,139,250,0.5)" }}
            animate={instantTransitions ? {} : { scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
            transition={instantTransitions ? { duration: 0 } : { duration: 2 * s, repeat: Infinity, ease: "easeOut" }}
          />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="4" fill="#7a8bad" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#7a8bad" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <motion.span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0c121c] bg-emerald-400"
            animate={instantTransitions ? {} : { scale: [1, 1.4, 1] }}
            transition={instantTransitions ? { duration: 0 } : { duration: 1.5 * s, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-[#e8ecf2]">Stranger</p>
          <div className="flex items-center gap-1.5">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              animate={instantTransitions ? {} : { opacity: [1, 0.3, 1] }}
              transition={instantTransitions ? { duration: 0 } : { duration: 1.2 * s, repeat: Infinity }}
            />
            <p className="text-[11px] text-[#7a8bad]">BanterBird · anonymous chat</p>
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/banterbird-logo.png" alt="BanterBird" style={{ height: 20, width: "auto", objectFit: "contain" }} />
      </div>

      {/* ── Message list ── */}
      <div className="flex flex-1 flex-col overflow-hidden px-4 pb-3">
        <div className="flex-1" />
        <div className="flex flex-col gap-3">
          {visibleMessages.map((msg, idx) => {
            const isMe = msg.sender === "me";
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 22, scale: 0.88, x: isMe ? 20 : -20 }}
                animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                transition={instantTransitions ? { duration: 0 } : {
                  type: "spring",
                  stiffness: Math.max(60, 280 / s),
                  damping: Math.max(8, 22 / s),
                }}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div className="flex max-w-[82%] flex-col gap-1">
                  {!isMe && (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-widest text-[#5c6d8f]">
                      Stranger
                    </span>
                  )}

                  {msg.imageUrl ? (
                    <div className={`overflow-hidden rounded-2xl ${isMe ? "rounded-br-md" : "rounded-bl-md"}`}
                      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={msg.imageUrl} alt="Attached" className="block max-h-48 w-full object-cover" />
                    </div>
                  ) : null}

                  {msg.text ? (
                    <motion.div
                      className={`relative rounded-3xl px-4 py-2.5 text-[15px] leading-snug ${isMe ? "rounded-br-md text-white" : "rounded-bl-md text-[#e8ecf2]"}`}
                      style={{
                        background: isMe
                          ? "linear-gradient(135deg, #1e3a5f 0%, #1a4a7a 100%)"
                          : "linear-gradient(135deg, #1e2a3d 0%, #243347 100%)",
                        boxShadow: isMe
                          ? "0 4px 16px rgba(30,58,95,0.55), 0 0 0 1px rgba(100,149,237,0.12)"
                          : "0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
                      }}
                    >
                      {/* Brief glow on appear */}
                      {!instantTransitions && (
                        <motion.div
                          className="pointer-events-none absolute inset-0 rounded-3xl"
                          initial={{ opacity: 0.6 }}
                          animate={{ opacity: 0 }}
                          transition={{ duration: 0.7 * s, ease: "easeOut" }}
                          style={{
                            background: isMe
                              ? "rgba(100,149,237,0.2)"
                              : "rgba(167,139,250,0.12)",
                          }}
                        />
                      )}
                      <p className="relative whitespace-pre-wrap break-words">{msg.text}</p>
                    </motion.div>
                  ) : null}
                </div>
              </motion.div>
            );
          })}

          {/* Typing indicator */}
          <AnimatePresence initial={false}>
            {strangerTyping && (
              <motion.div
                key={typingKey}
                initial={{ opacity: 0, y: 12, scale: 0.9, x: -16 }}
                animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 8, transition: { duration: instantTransitions ? 0 : 0.15 * s } }}
                transition={instantTransitions ? { duration: 0 } : {
                  type: "spring",
                  stiffness: Math.max(60, 320 / s),
                  damping: Math.max(8, 24 / s),
                }}
                className="flex justify-start"
              >
                <div className="flex flex-col gap-1">
                  <span className="ml-1 text-[10px] font-semibold uppercase tracking-widest text-[#5c6d8f]">Stranger</span>
                  <div className="rounded-3xl rounded-bl-md px-4 py-3" style={{ background: "#1e2a3d" }}>
                    <TypingDots instant={instantTransitions} slow={s} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Spacer that grows when choices overlay is visible */}
          <motion.div
            aria-hidden
            animate={{ height: choicesVisible ? 310 : 0 }}
            transition={instantTransitions ? { duration: 0 } : { type: "tween", duration: 0.5 * s, ease: "easeInOut" }}
            className="shrink-0"
          />
        </div>
      </div>

      {/* ── Composer bar ── */}
      <div
        className="flex shrink-0 items-center gap-3 border-t px-4 py-3"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(14,20,30,0.9)" }}
      >
        <div className="flex-1 rounded-2xl px-4 py-2.5 text-[14px] text-[#3f4f6f]"
          style={{ background: "#141f2e", border: "1px solid rgba(255,255,255,0.06)" }}>
          Say something nice…
        </div>
        <motion.div
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg, #1e3a5f, #2d4a7a)" }}
          animate={instantTransitions ? {} : { boxShadow: ["0 0 0px rgba(100,149,237,0)", "0 0 12px rgba(100,149,237,0.4)", "0 0 0px rgba(100,149,237,0)"] }}
          transition={instantTransitions ? { duration: 0 } : { duration: 2 * s, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M22 2L11 13" stroke="#6495ed" strokeWidth="2" strokeLinecap="round" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#6495ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </div>
    </div>
  );
}
