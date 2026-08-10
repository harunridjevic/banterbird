"use client";

/**
 * VideoTemplate
 * The 9:16 chat-scene renderer for BanterBird Reels.
 *
 * This is the "canvas" that gets recorded — it renders:
 *   - A BanterBird-branded phone chrome (status bar + header)
 *   - Animated chat bubbles (stranger + me) using the real bubble tokens
 *   - Optional attached images
 *
 * Props control which messages are currently visible so the VideoPreview
 * orchestrator can drive the playback timeline.
 */

import { motion, AnimatePresence } from "framer-motion";
import type { ChatMessage } from "@/lib/ops/video-generator-types";

interface Props {
  /** Messages to render (caller slices by timestamp) */
  visibleMessages: ChatMessage[];
  /** Show a typing indicator for the stranger */
  strangerTyping?: boolean;
  /**
   * When true the message list pads itself upward so messages stay visible
   * above the choices overlay (which is ~260px tall at the bottom).
   */
  choicesVisible?: boolean;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2.5 w-2.5 rounded-full bg-[#7a8bad]"
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.85,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
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
}: Props) {
  return (
    /*
     * Outer wrapper keeps the 9:16 ratio. The component is typically
     * rendered inside a scaled container so actual pixel dimensions vary,
     * but the ratio is always preserved via aspect-[9/16].
     */
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ background: "#0c121c" }}
    >
      {/* ── Phone chrome: status bar ── */}
      <div className="flex shrink-0 items-center justify-between px-6 pt-3 pb-1">
        <span className="text-[11px] font-semibold tabular-nums text-[#a8b5cc]">9:41</span>
        <div className="flex items-center gap-1.5">
          {/* signal bars */}
          <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={i * 4.5}
                y={12 - (i + 1) * 3}
                width="3"
                height={(i + 1) * 3}
                rx="0.5"
                fill={i < 3 ? "#a8b5cc" : "#2d3a52"}
              />
            ))}
          </svg>
          {/* battery */}
          <svg width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden>
            <rect x="0.5" y="0.5" width="18" height="11" rx="2.5" stroke="#a8b5cc" />
            <rect x="19.5" y="3.5" width="2" height="5" rx="1" fill="#a8b5cc" />
            <rect x="1.5" y="1.5" width="12" height="9" rx="1.5" fill="#a8b5cc" />
          </svg>
        </div>
      </div>

      {/* ── Chat header ── */}
      <div
        className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        {/* Avatar */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2d3a52]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="4" fill="#7a8bad" />
            <path
              d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
              stroke="#7a8bad"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          {/* online dot */}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0c121c] bg-emerald-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-[#e8ecf2]">Stranger</p>
          <p className="text-[11px] text-[#7a8bad]">BanterBird · anonymous chat</p>
        </div>

        {/* BanterBird logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/banterbird-logo.png"
          alt="BanterBird"
          style={{ height: 20, width: "auto", objectFit: "contain" }}
        />
      </div>

      {/* ── Message list ── */}
      {/*
       * mt-auto pushes the message stack to the bottom without justify-end.
       * This means adding a new message grows the stack downward in the DOM
       * (not upward), so existing bubbles never get repositioned by a CSS
       * reflow when a new item enters — eliminating the "shoot up" glitch.
       *
       * The typing indicator lives outside AnimatePresence so its exit
       * doesn't shrink/grow the container and cause a reflow.
       */}
      <div className="flex flex-1 flex-col overflow-hidden px-4 pb-3">
        {/* top spacer pushes messages to the bottom */}
        <div className="flex-1" />
        <div className="flex flex-col gap-3">
          {visibleMessages.map((msg) => {
            const isMe = msg.sender === "me";
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 14, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div className="flex max-w-[82%] flex-col gap-1">
                  {/* Sender label for stranger */}
                  {!isMe && (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-widest text-[#5c6d8f]">
                      Stranger
                    </span>
                  )}

                  {/* Image bubble */}
                  {msg.imageUrl ? (
                    <div
                      className={`overflow-hidden rounded-2xl ${
                        isMe ? "rounded-br-md" : "rounded-bl-md"
                      }`}
                      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.imageUrl}
                        alt="Attached"
                        className="block max-h-48 w-full object-cover"
                      />
                    </div>
                  ) : null}

                  {/* Text bubble */}
                  {msg.text ? (
                    <div
                      className={`rounded-3xl px-4 py-2.5 text-[15px] leading-snug ${
                        isMe
                          ? "rounded-br-md text-white"
                          : "rounded-bl-md text-[#e8ecf2]"
                      }`}
                      style={{
                        background: isMe ? "#1e3a5f" : "#1e2a3d",
                        boxShadow: isMe
                          ? "0 2px 10px rgba(30,58,95,0.45)"
                          : "0 2px 8px rgba(0,0,0,0.3)",
                      }}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            );
          })}

          {/* Typing indicator — outside the message map so it doesn't */}
          {/* trigger a gap reflow when it exits                        */}
          <AnimatePresence initial={false}>
            {strangerTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                className="flex justify-start"
              >
                <div className="flex flex-col gap-1">
                  <span className="ml-1 text-[10px] font-semibold uppercase tracking-widest text-[#5c6d8f]">
                    Stranger
                  </span>
                  <div
                    className="rounded-3xl rounded-bl-md px-4 py-3"
                    style={{ background: "#1e2a3d" }}
                  >
                    <TypingDots />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Spacer that grows when choices overlay is visible */}
          <motion.div
            aria-hidden
            animate={{ height: choicesVisible ? 310 : 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 30 }}
            className="shrink-0"
          />
        </div>
      </div>

      {/* ── Composer bar (decorative — not interactive during playback) ── */}
      <div
        className="flex shrink-0 items-center gap-3 border-t px-4 py-3"
        style={{
          borderColor: "rgba(255,255,255,0.07)",
          background: "rgba(14,20,30,0.9)",
        }}
      >
        <div
          className="flex-1 rounded-2xl px-4 py-2.5 text-[14px] text-[#3f4f6f]"
          style={{ background: "#141f2e", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          Say something nice…
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ background: "#1e2a3d" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M22 2L11 13" stroke="#3f4f6f" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M22 2L15 22L11 13L2 9L22 2Z"
              stroke="#3f4f6f"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
