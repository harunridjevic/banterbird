"use client";

/**
 * VideoTemplate
 * The 9:16 chat-scene renderer for BanterBird Reels.
 *
 * Structure
 * ─────────
 * Outer shell  — full 9:16 frame with equal safe-zone padding so the
 *                card is centred. Background looks like the chat content
 *                bleeding out — violet/teal colour washes + noise grain.
 * Inner card   — the visible phone screen, clipped + bordered.
 *
 * Safe zones (% of the respective dimension)
 *   Top    8 %  — TikTok camera, back button, status icons
 *   Bottom 22 % — nav bar, like/comment/share/follow
 *   Left   8 %  — username + caption
 *   Right  8 %  — side button stack
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import type { ChatMessage, VideoAspectRatio } from "@/lib/ops/video-generator-types";

interface Props {
  visibleMessages: ChatMessage[];
  strangerTyping?: boolean;
  choicesVisible?: boolean;
  instantTransitions?: boolean;
  slowFactor?: number;
  typingKey?: string;
  aspectRatio?: VideoAspectRatio;
}

// Sparkle coordinates for widescreen background
const WIDESCREEN_SPARKLES = [
  { id: 1, left: "6%", top: "18%", size: 14, delay: 0, duration: 2.8, color: "#a78bfa" },
  { id: 2, left: "14%", top: "35%", size: 20, delay: 0.7, duration: 3.4, color: "#38bdf8" },
  { id: 3, left: "9%", top: "68%", size: 16, delay: 1.4, duration: 2.5, color: "#f472b6" },
  { id: 4, left: "18%", top: "82%", size: 12, delay: 2.0, duration: 3.0, color: "#fbbf24" },
  { id: 5, left: "84%", top: "15%", size: 18, delay: 0.3, duration: 3.2, color: "#38bdf8" },
  { id: 6, left: "91%", top: "42%", size: 15, delay: 1.1, duration: 2.6, color: "#a78bfa" },
  { id: 7, left: "80%", top: "64%", size: 22, delay: 1.8, duration: 3.6, color: "#f472b6" },
  { id: 8, left: "88%", top: "85%", size: 14, delay: 0.9, duration: 2.9, color: "#34d399" },
];

function SparkleStar({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
        fill={color}
      />
    </svg>
  );
}

function TypingDots({ instant, slow, isWidescreen }: { instant: boolean; slow: number; isWidescreen?: boolean }) {
  return (
    <div className={`flex items-center ${isWidescreen ? "gap-1 px-0.5 py-0.5" : "gap-1.5 px-1 py-0.5"}`}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`${isWidescreen ? "h-1.5 w-1.5" : "h-2.5 w-2.5"} rounded-full bg-[#38bdf8]`}
          animate={{ y: isWidescreen ? [0, -3.5, 0] : [0, -6, 0], opacity: [0.4, 1, 0.4] }}
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
  aspectRatio = "9:16",
}: Props) {
  const s = slowFactor;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isWidescreen = aspectRatio === "16:9";

  // Scroll only the message container to the bottom — never the page.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length, strangerTyping, choicesVisible]);

  return (
    /*
     * ── Outer shell ───────────────────────────────────────────────────
     * Safe-zone padding for TikTok / Reels / Widescreen:
     * 8% horizontal, 8% top, 22% bottom (clear for UI overlays)
     */
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{
        background: "#070b14",
        filter: "saturate(1.22) contrast(1.04)",
      }}
    >
      {/* ── Background layers (stretches across entire 16:9 / 9:16 widescreen) ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {/* 1. Base Dark Cosmic Gradient */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #050811 0%, #090e1a 50%, #060a14 100%)" }} />

        {/* 2. Vivid Aurora / Nebula Glowing Washes */}
        <motion.div
          className="absolute inset-0"
          animate={instantTransitions ? {} : {
            scale: [1, 1.06, 1],
            opacity: [0.85, 1, 0.85],
          }}
          transition={{ duration: 6 * s, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: isWidescreen
              ? "radial-gradient(ellipse 45% 65% at 10% 25%, rgba(139,92,246,0.48) 0%, transparent 65%), " +
                "radial-gradient(ellipse 45% 65% at 90% 75%, rgba(6,182,212,0.45) 0%, transparent 65%), " +
                "radial-gradient(ellipse 55% 45% at 50% 0%, rgba(236,72,153,0.30) 0%, transparent 70%), " +
                "radial-gradient(ellipse 60% 45% at 50% 100%, rgba(59,130,246,0.35) 0%, transparent 70%)"
              : "radial-gradient(ellipse 75% 55% at 0% 0%, rgba(139,92,246,0.55) 0%, transparent 65%), " +
                "radial-gradient(ellipse 70% 50% at 100% 100%, rgba(6,182,212,0.48) 0%, transparent 65%), " +
                "radial-gradient(ellipse 40% 50% at 100% 45%, rgba(236,72,153,0.30) 0%, transparent 70%)",
          }}
        />

        {/* 3. Widescreen Shiny Shimmer Light Beams */}
        {isWidescreen && !instantTransitions && (
          <motion.div
            className="absolute inset-0"
            animate={{
              backgroundPosition: ["0% 0%", "200% 200%"],
            }}
            transition={{
              duration: 8 * s,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{
              backgroundImage:
                "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.08) 42%, rgba(167,139,250,0.25) 48%, rgba(56,189,248,0.3) 52%, rgba(244,114,182,0.22) 58%, transparent 75%)",
              backgroundSize: "200% 200%",
            }}
          />
        )}

        {/* 4. Widescreen Sparkling Glints / Star Bursts */}
        {isWidescreen && !instantTransitions && WIDESCREEN_SPARKLES.map((sp) => (
          <motion.div
            key={sp.id}
            className="absolute flex items-center justify-center"
            style={{ left: sp.left, top: sp.top }}
            animate={{
              scale: [0, 1.25, 0],
              rotate: [0, 90, 180],
              opacity: [0, 0.95, 0],
            }}
            transition={{
              duration: sp.duration * s,
              repeat: Infinity,
              delay: sp.delay * s,
              ease: "easeInOut",
            }}
          >
            <SparkleStar size={sp.size} color={sp.color} />
          </motion.div>
        ))}



        {/* 6. Vignette overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 65% 70% at 50% 50%, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.85) 100%)",
          }}
        />
      </div>

      {/* ── Floating App Popup Card (Full Height in 16:9, Full-Frame in 9:16) ── */}
      <div
        className="relative flex h-full flex-col overflow-hidden items-center justify-center"
        style={{
          width: isWidescreen ? "min(285px, calc(100% * 9 / 16))" : "100%",
          maxWidth: "100%",
          padding: isWidescreen ? 0 : "8% 8% 22% 8%",
        }}
      >
        <div
          className="relative flex h-full w-full flex-col overflow-hidden"
          style={{
            borderRadius: isWidescreen ? "0" : "2.5%",
            borderLeft: isWidescreen ? "1.5px solid rgba(255,255,255,0.14)" : "1.5px solid rgba(255,255,255,0.12)",
            borderRight: isWidescreen ? "1.5px solid rgba(255,255,255,0.14)" : "1.5px solid rgba(255,255,255,0.12)",
            borderTop: isWidescreen ? "none" : "1.5px solid rgba(255,255,255,0.12)",
            borderBottom: isWidescreen ? "none" : "1.5px solid rgba(255,255,255,0.12)",
            boxShadow: isWidescreen
              ? "0 0 0 1px rgba(255,255,255,0.06) inset, " +
                "0 0 80px 20px rgba(0,0,0,0.9), " +
                "0 0 60px 15px rgba(139,92,246,0.35), " +
                "0 0 100px 30px rgba(6,182,212,0.22)"
              : "0 0 0 1px rgba(255,255,255,0.06) inset, " +
                "0 8px 80px 0 rgba(0,0,0,0.85), " +
                "0 0 45px 10px rgba(139,92,246,0.24)",
            background: "#0c1322",
          }}
        >
        {/* Dynamic background inside card — shifts when choices active */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={instantTransitions ? {} : { opacity: choicesVisible ? 1 : 0 }}
          transition={instantTransitions ? { duration: 0 } : { type: "tween", duration: 0.8 * s, ease: "easeInOut" }}
          style={{ background: "linear-gradient(180deg, #090e1f 0%, #0d1628 40%, #070c18 100%)" }}
        />

        {/* Violet ambient top glow inside card */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 h-44"
          animate={instantTransitions ? {} : { opacity: choicesVisible ? 0.45 : 0.18 }}
          transition={instantTransitions ? { duration: 0 } : { type: "tween", duration: 1 * s, ease: "easeInOut" }}
          style={{ background: "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(139,92,246,0.38) 0%, transparent 100%)" }}
        />

        {/* ── Status bar ── */}
        <div className={`relative flex shrink-0 items-center justify-between ${isWidescreen ? "px-3.5 pt-2 pb-0.5" : "px-6 pt-3 pb-1"}`}>
          <span className={`${isWidescreen ? "text-[9.5px]" : "text-[11px]"} font-bold tabular-nums text-[#cbd5e1]`}>9:41</span>
          <div className={`flex items-center ${isWidescreen ? "gap-1 scale-85 origin-right" : "gap-1.5"}`}>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <rect key={i} x={i * 4.5} y={12 - (i + 1) * 3} width="3" height={(i + 1) * 3} rx="0.5"
                  fill={i < 3 ? "#38bdf8" : "#1e293b"} />
              ))}
            </svg>
            <svg width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden>
              <rect x="0.5" y="0.5" width="18" height="11" rx="2.5" stroke="#38bdf8" />
              <rect x="19.5" y="3.5" width="2" height="5" rx="1" fill="#38bdf8" />
              <rect x="1.5" y="1.5" width="12" height="9" rx="1.5" fill="#38bdf8" />
            </svg>
          </div>
        </div>

        {/* ── Chat header ── */}
        <div
          className={`relative flex shrink-0 items-center border-b ${
            isWidescreen ? "gap-2 px-3 py-1.5" : "gap-3 px-5 py-3"
          }`}
          style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(15,23,42,0.6)" }}
        >
          {/* Avatar with pulse ring */}
          <div
            className={`relative flex shrink-0 items-center justify-center rounded-full bg-[#1e293b] ${
              isWidescreen ? "h-7 w-7" : "h-10 w-10"
            }`}
            style={{ boxShadow: "0 0 15px rgba(139,92,246,0.3)" }}
          >
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: isWidescreen ? "1.5px solid rgba(167,139,250,0.7)" : "2px solid rgba(167,139,250,0.7)" }}
              animate={instantTransitions ? {} : { scale: [1, 1.35, 1], opacity: [0.9, 0, 0.9] }}
              transition={instantTransitions ? { duration: 0 } : { duration: 2 * s, repeat: Infinity, ease: "easeOut" }}
            />
            <svg width={isWidescreen ? "15" : "22"} height={isWidescreen ? "15" : "22"} viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="8" r="4" fill="#94a3b8" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <motion.span
              className={`absolute bottom-0 right-0 rounded-full border-2 border-[#0c121c] bg-[#10b981] ${
                isWidescreen ? "h-2 w-2" : "h-2.5 w-2.5"
              }`}
              style={{ boxShadow: "0 0 8px #10b981" }}
              animate={instantTransitions ? {} : { scale: [1, 1.4, 1] }}
              transition={instantTransitions ? { duration: 0 } : { duration: 1.5 * s, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className={`${isWidescreen ? "text-xs" : "text-sm"} font-bold leading-tight text-white`}>Stranger</p>
            <div className="flex items-center gap-1">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-[#10b981]"
                style={{ boxShadow: "0 0 6px #10b981" }}
                animate={instantTransitions ? {} : { opacity: [1, 0.3, 1] }}
                transition={instantTransitions ? { duration: 0 } : { duration: 1.2 * s, repeat: Infinity }}
              />
              <p className={`${isWidescreen ? "text-[9.5px]" : "text-[11px]"} font-medium text-[#94a3b8]`}>
                BanterBird · anonymous
              </p>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banterbird-logo.png"
            alt="BanterBird"
            crossOrigin="anonymous"
            style={{
              height: isWidescreen ? 16 : 22,
              width: "auto",
              objectFit: "contain",
              filter: "drop-shadow(0 2px 8px rgba(139,92,246,0.5))",
            }}
          />
        </div>

        {/* ── Message list ── */}
        <div
          ref={scrollRef}
          className={`relative flex flex-1 flex-col overflow-y-auto ${
            isWidescreen ? "gap-2 px-3 pt-2 pb-2" : "gap-3 px-4 pt-3 pb-3"
          }`}
          style={{ scrollbarWidth: "none" }}
        >
          {visibleMessages.map((msg) => {
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
                <div className="flex max-w-[84%] flex-col gap-0.5">
                  {!isMe && (
                    <span className={`ml-1 ${isWidescreen ? "text-[8.5px]" : "text-[10px]"} font-bold uppercase tracking-widest text-[#94a3b8]`}>
                      Stranger
                    </span>
                  )}

                  {msg.imageUrl ? (
                    <div
                      className={`overflow-hidden rounded-2xl ${isMe ? "rounded-br-md" : "rounded-bl-md"}`}
                      style={{ boxShadow: "0 4px 18px rgba(0,0,0,0.5)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={msg.imageUrl} alt="Attached" crossOrigin="anonymous" className="block max-h-48 w-full object-cover" />
                    </div>
                  ) : null}

                  {msg.text ? (
                    <motion.div
                      className={`relative font-medium leading-snug ${
                        isWidescreen
                          ? `px-3 py-1.5 text-[11.5px] rounded-2xl ${isMe ? "rounded-br-sm text-white" : "rounded-bl-sm text-[#f8fafc]"}`
                          : `px-4 py-2.5 text-[15px] rounded-3xl ${isMe ? "rounded-br-md text-white" : "rounded-bl-md text-[#f8fafc]"}`
                      }`}
                      style={{
                        background: isMe
                          ? "linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)"
                          : "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
                        border: isMe
                          ? "1px solid rgba(96,165,250,0.35)"
                          : "1px solid rgba(148,163,184,0.18)",
                        boxShadow: isMe
                          ? "0 6px 22px rgba(29,78,216,0.55), 0 0 14px rgba(2,132,199,0.35)"
                          : "0 6px 18px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
                      }}
                    >
                      {/* Brief glow on appear */}
                      {!instantTransitions && (
                        <motion.div
                          className="pointer-events-none absolute inset-0 rounded-2xl"
                          initial={{ opacity: 0.7 }}
                          animate={{ opacity: 0 }}
                          transition={{ duration: 0.7 * s, ease: "easeOut" }}
                          style={{
                            background: isMe ? "rgba(56,189,248,0.35)" : "rgba(167,139,250,0.25)",
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
                <div className="flex flex-col gap-0.5">
                  <span className={`ml-1 ${isWidescreen ? "text-[8.5px]" : "text-[10px]"} font-bold uppercase tracking-widest text-[#94a3b8]`}>
                    Stranger
                  </span>
                  <div
                    className={
                      isWidescreen
                        ? "rounded-2xl rounded-bl-sm px-3 py-2"
                        : "rounded-3xl rounded-bl-md px-4 py-3"
                    }
                    style={{ background: "#1e293b", border: "1px solid rgba(148,163,184,0.18)" }}
                  >
                    <TypingDots instant={instantTransitions} slow={s} isWidescreen={isWidescreen} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Spacer grows when choices overlay is visible */}
          <motion.div
            aria-hidden
            animate={{ height: choicesVisible ? (isWidescreen ? 230 : 340) : 0 }}
            transition={instantTransitions ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 28 }}
            className="shrink-0"
          />
        </div>

        {/* ── Composer bar (decorative) ── */}
        <div
          className={`relative flex shrink-0 items-center border-t ${
            isWidescreen ? "gap-2 px-3 py-2" : "gap-3 px-4 py-3"
          }`}
          style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(15,23,42,0.92)" }}
        >
          <div
            className={`flex-1 ${
              isWidescreen
                ? "rounded-xl px-3 py-1.5 text-[11px]"
                : "rounded-2xl px-4 py-2.5 text-[14px]"
            } text-[#64748b]`}
            style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Say something nice…
          </div>
          <motion.div
            className={`flex shrink-0 items-center justify-center ${
              isWidescreen ? "h-7 w-7 rounded-xl" : "h-10 w-10 rounded-2xl"
            }`}
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)", boxShadow: "0 0 16px rgba(37,99,235,0.4)" }}
            animate={instantTransitions ? {} : {
              boxShadow: ["0 0 8px rgba(37,99,235,0.3)", "0 0 20px rgba(6,182,212,0.6)", "0 0 8px rgba(37,99,235,0.3)"],
            }}
            transition={instantTransitions ? { duration: 0 } : { duration: 2 * s, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg width={isWidescreen ? "13" : "18"} height={isWidescreen ? "13" : "18"} viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M22 2L11 13" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
        </div>
      </div>
    </div>
  </div>
  );
}
