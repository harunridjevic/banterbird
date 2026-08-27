"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Choice, VideoAspectRatio } from "@/lib/ops/video-generator-types";

export type ChoicePhase =
  | "hidden"
  | "enter"
  | "pulse-a"
  | "pulse-b"
  | "winner-a"
  | "winner-b"
  | "exit";

interface Props {
  choices: [Choice, Choice];
  phase: ChoicePhase;
  instantTransitions?: boolean;
  slowFactor?: number;
  aspectRatio?: VideoAspectRatio;
}

// Saturated opaque backgrounds & rich glowing borders
const SLOT = {
  A: {
    idle:   { bg: "#1f103d", border: "rgba(139,92,246,0.65)",  label: "#c4b5fd", glow: "rgba(139,92,246,0.7)" },
    winner: { bg: "#2e105e", border: "rgba(167,139,250,1)", label: "#ede9fe", text: "#ffffff", shadow: "0 0 50px 16px rgba(139,92,246,0.65)" },
  },
  B: {
    idle:   { bg: "#06262d", border: "rgba(6,182,212,0.65)",  label: "#38bdf8", glow: "rgba(6,182,212,0.7)" },
    winner: { bg: "#083e38", border: "rgba(45,212,191,1)",  label: "#ccfbf1", text: "#ffffff", shadow: "0 0 50px 16px rgba(20,184,166,0.65)" },
  },
} as const;

function isWinner(phase: ChoicePhase, slot: "A" | "B") { return phase === `winner-${slot.toLowerCase()}`; }
function isPulse (phase: ChoicePhase, slot: "A" | "B") { return phase === `pulse-${slot.toLowerCase()}`; }

function ChoiceButton({ choice, phase, instant, slow, index }: {
  choice: Choice; phase: ChoicePhase; instant: boolean; slow: number; index: number;
}) {
  const slot  = choice.slot;
  const c     = SLOT[slot];
  const win   = isWinner(phase, slot);
  const pulse = isPulse(phase, slot);
  const sp    = (k: number, d: number) => ({ type: "spring" as const, stiffness: Math.max(40, k / slow), damping: Math.max(6, d / slow) });

  return (
    <motion.div
      initial={{ opacity: 0, y: 36, scale: 0.88 }}
      animate={
        win   ? { opacity: 1, y: 0, scale: 1.04 } :
        pulse ? { opacity: 1, y: 0, scale: 1 } :
        phase === "exit" ? { opacity: 0.35, y: 0, scale: 0.97 } :
                { opacity: 1, y: 0, scale: 1 }
      }
      transition={instant ? { duration: 0 } : win
        ? sp(200, 18)
        : { ...sp(220, 20), delay: index * 0.1 * slow }
      }
      className="relative overflow-hidden rounded-2xl px-5 py-4"
      style={{
        background: c.idle.bg,
        border: `2px solid ${c.idle.border}`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
      }}
    >
      {/* Winner highlight layer */}
      <AnimatePresence>
        {win && (
          <motion.div
            key="winner-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={instant ? { duration: 0 } : { type: "tween", duration: 0.4 * slow, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background: `linear-gradient(135deg, ${c.winner.bg} 0%, ${c.idle.bg} 100%)`,
              border: `2px solid ${c.winner.border}`,
              boxShadow: c.winner.shadow,
            }}
          />
        )}
      </AnimatePresence>

      {/* Pulse glow layer */}
      <AnimatePresence>
        {pulse && !instant && (
          <motion.div
            key="pulse-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 * slow, ease: "easeInOut" }}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{ boxShadow: `0 0 30px 8px ${c.idle.glow}`, border: `2px solid ${c.idle.border}` }}
          />
        )}
      </AnimatePresence>

      {/* Shimmer sweep on pulse */}
      <AnimatePresence>
        {pulse && !instant && (
          <motion.div
            key="shimmer"
            className="pointer-events-none absolute inset-0 rounded-2xl"
            initial={{ x: "-110%" }}
            animate={{ x: "160%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75 * slow, ease: "easeInOut" }}
            style={{ background: "linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.22) 50%, transparent 75%)" }}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2">
          <motion.span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black"
            style={{ background: win ? c.winner.border : c.idle.border, color: "#0c121c" }}
            animate={win && !instant ? { scale: [1, 1.25, 1] } : {}}
            transition={{ duration: 0.5 * slow, repeat: Infinity, repeatDelay: 0.8 * slow }}
          >
            {slot}
          </motion.span>
          <span
            className="text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ color: win ? c.winner.label : c.idle.label }}
          >
            Option {slot}
          </span>
        </div>
        <p
          className="text-[17px] font-bold leading-snug"
          style={{ color: win ? c.winner.text : "#d1d9e6" }}
        >
          {choice.label}
        </p>
      </div>

      {/* Winner checkmark */}
      <AnimatePresence>
        {win && (
          <motion.div
            key="checkmark"
            initial={instant ? false : { scale: 0, opacity: 0, rotate: -40 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={instant ? { duration: 0 } : {
              type: "spring",
              stiffness: Math.max(80, 450 / slow),
              damping: Math.max(8, 18 / slow),
            }}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2"
          >
            <motion.div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: c.winner.border }}
              animate={instant ? {} : { scale: [1, 1.12, 1] }}
              transition={{ duration: 1.2 * slow, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path d="M5 12L10 17L19 7" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ChoicesOverlay({
  choices,
  phase,
  instantTransitions = false,
  slowFactor = 1,
  aspectRatio = "9:16",
}: Props) {
  if (phase === "hidden") return null;
  const s  = slowFactor;
  const isWidescreen = aspectRatio === "16:9";
  const sp = (k: number, d: number) => ({ type: "spring" as const, stiffness: Math.max(40, k / s), damping: Math.max(6, d / s) });

  return (
    <motion.div
      initial={{ y: "105%", opacity: 0 }}
      animate={phase === "exit" ? { y: "110%", opacity: 0 } : { y: 0, opacity: 1 }}
      transition={instantTransitions ? { duration: 0 } : (phase === "exit"
        ? { type: "tween", duration: 0.35 * s, ease: "easeIn" }
        : sp(160, 24)
      )}
      className="absolute z-20 px-4 pb-4 pt-3"
      style={{
        left: 0,
        right: 0,
        bottom: 0,
        /* Solid base so nothing behind bleeds through */
        background: "#0a1020",
        borderRadius: isWidescreen ? "0px" : "0 0 28px 28px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 -24px 48px 16px #0a1020",
      }}
    >
      {/* Header */}
      <motion.div
        className="mb-4 text-center"
        animate={instantTransitions ? {} : { y: [0, -3, 0] }}
        transition={{ duration: 2 * s, repeat: Infinity, ease: "easeInOut" }}
      >
        <span
          className="rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.22em]"
          style={{ color: "#c4b5fd", background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.35)" }}
        >
          ✨ What would you do?
        </span>
      </motion.div>

      {/* Buttons */}
      <div className="flex flex-col gap-3">
        {choices.map((choice, i) => (
          <ChoiceButton
            key={choice.id}
            choice={choice}
            phase={phase}
            instant={instantTransitions}
            slow={s}
            index={i}
          />
        ))}
      </div>

      {/* VS divider */}
      <motion.div
        className="mt-3 flex items-center justify-center gap-3"
        animate={instantTransitions ? {} : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.2 * s, repeat: Infinity }}
      >
        <div className="h-px flex-1" style={{ background: "linear-gradient(to right, transparent, rgba(167,139,250,0.35))" }} />
        <span className="text-[13px] font-black" style={{ color: "#8a9bbf" }}>VS</span>
        <div className="h-px flex-1" style={{ background: "linear-gradient(to left, transparent, rgba(45,212,191,0.35))" }} />
      </motion.div>
    </motion.div>
  );
}
