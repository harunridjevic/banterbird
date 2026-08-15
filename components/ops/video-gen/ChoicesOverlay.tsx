"use client";

/**
 * ChoicesOverlay
 *
 * The viral "choose one" panel that slides up from the bottom.
 * Animation phases:
 *   1. Slide up — both choices appear
 *   2. Pulse A (scale + glow)
 *   3. Pulse B (scale + glow)
 *   4. Winner highlights and holds
 *   5. Component fades out (controlled by parent)
 *
 * The parent drives the `phase` prop from the global timeline clock.
 */

import { motion } from "framer-motion";
import type { Choice } from "@/lib/ops/video-generator-types";

export type ChoicePhase =
  | "hidden"
  | "enter"       // sliding in
  | "pulse-a"     // A glowing
  | "pulse-b"     // B glowing
  | "winner-a"    // A is the winner — held
  | "winner-b"    // B is the winner — held
  | "exit";       // fading out

interface Props {
  choices: [Choice, Choice];
  phase: ChoicePhase;
}

const SLOT_COLORS = {
  A: {
    base: "#1a0f35",
    border: "rgba(124,58,237,0.5)",
    glow: "rgba(124,58,237,0.55)",
    label: "#a78bfa",
  },
  B: {
    base: "#0a2026",
    border: "rgba(20,184,166,0.45)",
    glow: "rgba(20,184,166,0.52)",
    label: "#2dd4bf",
  },
} as const;

const WINNER_COLORS = {
  A: {
    bg: "#2a1250",
    border: "rgba(167,139,250,0.8)",
    glow: "0 0 32px 6px rgba(124,58,237,0.55)",
    text: "#ede9fe",
    label: "#a78bfa",
  },
  B: {
    bg: "#0d2e2a",
    border: "rgba(45,212,191,0.75)",
    glow: "0 0 32px 6px rgba(20,184,166,0.5)",
    text: "#ccfbf1",
    label: "#2dd4bf",
  },
} as const;

function isWinnerPhase(phase: ChoicePhase, slot: "A" | "B") {
  return phase === `winner-${slot.toLowerCase()}`;
}

function isPulsePhase(phase: ChoicePhase, slot: "A" | "B") {
  return phase === `pulse-${slot.toLowerCase()}`;
}

function ChoiceButton({
  choice,
  phase,
}: {
  choice: Choice;
  phase: ChoicePhase;
}) {
  const slot = choice.slot;
  const colors = SLOT_COLORS[slot];
  const winColors = WINNER_COLORS[slot];
  const isWinner = isWinnerPhase(phase, slot);
  const isPulsing = isPulsePhase(phase, slot);

  return (
    <motion.div
      animate={
        isWinner
          ? { scale: 1.04, opacity: 1 }
          : isPulsing
          ? { scale: [1, 1.035, 1], opacity: 1 }
          : { scale: 1, opacity: phase === "exit" ? 0.5 : 1 }
      }
      transition={
        isPulsing
          ? { duration: 0.55, ease: "easeInOut", repeat: 1, repeatType: "reverse" }
          : { type: "spring", stiffness: 320, damping: 22 }
      }
      className="relative overflow-hidden rounded-2xl px-5 py-4"
      style={{
        background: isWinner ? winColors.bg : colors.base,
        border: `2px solid ${isWinner ? winColors.border : colors.border}`,
        boxShadow: isWinner ? winColors.glow : isPulsing ? `0 0 20px 4px ${colors.glow}` : "none",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
      }}
    >
      {/* Slot badge */}
      <span
        className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em]"
        style={{ color: isWinner ? winColors.label : colors.label }}
      >
        Option {slot}
      </span>

      {/* Choice text */}
      <p
        className="text-[17px] font-bold leading-snug"
        style={{ color: isWinner ? winColors.text : "#d1d9e6" }}
      >
        {choice.label}
      </p>

      {/* Winner checkmark */}
      {isWinner && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.05 }}
          className="absolute right-4 top-1/2 -translate-y-1/2"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: winColors.border }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12L10 17L19 7"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </motion.div>
      )}

      {/* Shimmer for pulsing state */}
      {isPulsing && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.15, 0] }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
          style={{ background: "linear-gradient(135deg, white 0%, transparent 60%)" }}
        />
      )}
    </motion.div>
  );
}

export function ChoicesOverlay({ choices, phase }: Props) {
  if (phase === "hidden") return null;

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={
        phase === "exit"
          ? { y: "100%", opacity: 0 }
          : { y: 0, opacity: 1 }
      }
      transition={
        phase === "exit"
          ? { duration: 0.38, ease: [0.4, 0, 1, 1] }
          : { type: "spring", stiffness: 280, damping: 28 }
      }
      className="absolute z-20 px-4 pb-4 pt-3"
      style={{
        left: "8%",
        right: "8%",
        bottom: "22%",
        /* Solid base so nothing from behind bleeds through */
        background: "#0a1020",
        /* Soft fade only at the very top edge so it blends into the chat */
        borderTop: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 -24px 48px 16px #0a1020", /* kills any bleed above the panel */
      }}
    >
      {/* Header */}
      <div className="mb-3 text-center">
        <span
          className="text-[11px] font-black uppercase tracking-[0.2em]"
          style={{ color: "#8a9bbf" }}
        >
          What would you do?
        </span>
      </div>

      {/* Choice buttons */}
      <div className="flex flex-col gap-3">
        {choices.map((choice) => (
          <ChoiceButton key={choice.id} choice={choice} phase={phase} />
        ))}
      </div>

      {/* Decorative vs divider */}
      <div className="mt-2 flex items-center justify-center gap-3">
        <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.10)" }} />
        <span className="text-[11px] font-bold" style={{ color: "#6b7fa8" }}>
          VS
        </span>
        <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.10)" }} />
      </div>
    </motion.div>
  );
}
