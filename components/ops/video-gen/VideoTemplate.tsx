"use client";

/**
 * VideoTemplate
 * The 9:16 chat-scene renderer for BanterBird Reels.
 *
 * Structure
 * ─────────
 * Outer shell  — full 9:16 frame with safe-zone padding (equal H margins
 *                so the card is centred). Background looks like the chat
 *                content bleeding out into a blurred "behind the phone"
 *                environment — violet/teal colour wash + noise texture.
 * Inner card   — the visible phone screen, clipped + bordered.
 *
 * Safe zones
 *   Top    8 %  — TikTok camera, back button, status icons
 *   Bottom 22 % — nav bar, like/comment/share/follow
 *   Left   8 %  — username + caption (equal to right keeps card centred)
 *   Right  8 %  — side button stack (TikTok buttons are ~60-70px on a
 *                  1080px frame ≈ 6 %; 8 % gives comfortable clearance)
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/ops/video-generator-types";

interface Props {
  visibleMessages: ChatMessage[];
  strangerTyping?: boolean;
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
          transition={{ duration: 0.85, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length, strangerTyping, choicesVisible]);

  return (
    <div
      className="relative flex h-full w-full overflow-hidden"
      style={{
        // Equal left/right padding so the card is perfectly centred.
        // Top/bottom match TikTok safe zones.
        padding: "8% 8% 22% 8%",
      }}
    >
      {/* ── Background: blurred "world behind the phone" ───────────────
       *
       * Layers (back to front):
       *  1. Base deep navy — matches the chat card colour so it feels
       *     like the same scene extending outward.
       *  2. Two large soft colour washes (violet top-left, teal
       *     bottom-right) — echo the choice button accent colours and
       *     bleed in from the edges, as if the phone glow is spilling
       *     onto the surface it's sitting on.
       *  3. Noise overlay — a repeating SVG grain at very low opacity
       *     gives the margins the slightly textured look of a real
       *     camera capture rather than a flat fill.
       *  4. Centre vignette — a radial dark overlay that pushes the
       *     glow to the periphery and makes the card read as the focal
       *     point of the scene.
       * ──────────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* 1. Base */}
        <div className="absolute inset-0" style={{ background: "#090e18" }} />

        {/* 2a. Violet wash — top-left corner bleeds in */}
        <div
          className="absolute"
          style={{
            inset: 0,
            background:
              "radial-gradient(ellipse 75% 55% at 0% 0%, rgba(109,40,217,0.45) 0%, transparent 65%)",
          }}
        />

        {/* 2b. Teal wash — bottom-right corner bleeds in */}
        <div
          className="absolute"
          style={{
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 50% at 100% 100%, rgba(13,148,136,0.38) 0%, transparent 65%)",
          }}
        />

        {/* 2c. Faint violet mid-right — echoes the right safe-zone gutter */}
        <div
          className="absolute"
          style={{
            inset: 0,
            background:
              "radial-gradient(ellipse 30% 45% at 100% 45%, rgba(124,58,237,0.22) 0%, transparent 70%)",
          }}
        />

        {/* 3. Noise grain */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "180px 180px",
          }}
        />

        {/* 4. Centre vignette — darkens the middle so card pops */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 65% at 50% 50%, rgba(0,0,0,0.55) 0%, transparent 100%)",
          }}
        />
      </div>

      {/* ── Inner card ─────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-1 flex-col overflow-hidden"
        style={{
          borderRadius: "2.5%",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.04) inset, " +
            "0 8px 80px 0 rgba(0,0,0,0.8), " +
            "0 0 40px 8px rgba(109,40,217,0.18)",   // violet halo from behind
          background: "#0c121c",
        }}
      >
        {/* ── Status bar ── */}
        <div className="flex shrink-0 items-center justify-between px-6 pt-3 pb-1">
          <span className="text-[11px] font-semibold tabular-nums text-[#a8b5cc]">9:41</span>
          <div className="flex items-center gap-1.5">
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
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2d3a52]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="8" r="4" fill="#7a8bad" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#7a8bad" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0c121c] bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-[#e8ecf2]">Stranger</p>
            <p className="text-[11px] text-[#7a8bad]">BanterBird · anonymous chat</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/banterbird-logo.png" alt="BanterBird" style={{ height: 20, width: "auto", objectFit: "contain" }} />
        </div>

        {/* ── Message list ── */}
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-3"
          style={{ scrollbarWidth: "none" }}
        >
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
                  {!isMe && (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-widest text-[#5c6d8f]">
                      Stranger
                    </span>
                  )}
                  {msg.imageUrl ? (
                    <div
                      className={`overflow-hidden rounded-2xl ${isMe ? "rounded-br-md" : "rounded-bl-md"}`}
                      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={msg.imageUrl} alt="Attached" className="block max-h-48 w-full object-cover" />
                    </div>
                  ) : null}
                  {msg.text ? (
                    <div
                      className={`rounded-3xl px-4 py-2.5 text-[15px] leading-snug ${
                        isMe ? "rounded-br-md text-white" : "rounded-bl-md text-[#e8ecf2]"
                      }`}
                      style={{
                        background: isMe ? "#1e3a5f" : "#1e2a3d",
                        boxShadow: isMe ? "0 2px 10px rgba(30,58,95,0.45)" : "0 2px 8px rgba(0,0,0,0.3)",
                      }}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            );
          })}

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
                  <div className="rounded-3xl rounded-bl-md px-4 py-3" style={{ background: "#1e2a3d" }}>
                    <TypingDots />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/*
           * When choices are visible this spacer grows to push messages
           * well above the overlay. 320px gives enough clearance for
           * the header + two buttons + VS divider at the overlay's height.
           */}
          <motion.div
            aria-hidden
            animate={{ height: choicesVisible ? 340 : 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 28 }}
            className="shrink-0"
          />
        </div>

        {/* ── Composer bar (decorative) ── */}
        <div
          className="flex shrink-0 items-center gap-3 border-t px-4 py-3"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(14,20,30,0.9)" }}
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
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#3f4f6f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
