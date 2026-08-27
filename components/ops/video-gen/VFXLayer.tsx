"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ChoicePhase } from "./ChoicesOverlay";
import type { VideoTimeline, VideoAspectRatio } from "@/lib/ops/video-generator-types";

interface Props {
  elapsedMs: number;
  timeline: VideoTimeline;
  choicePhase: ChoicePhase;
  messageCount: number;
  instantTransitions?: boolean;
  slowFactor?: number;
  aspectRatio?: VideoAspectRatio;
}

// ─── Ambient particles ────────────────────────────────────────────────────────

const AMBIENT = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  x: `${6 + (i * 6.2) % 88}%`,
  y: `${8 + (i * 11) % 82}%`,
  size: 2.5 + (i % 4),
  color: i % 4 === 0
    ? "rgba(167,139,250,0.55)"
    : i % 4 === 1
    ? "rgba(56,189,248,0.5)"
    : i % 4 === 2
    ? "rgba(244,114,182,0.45)"
    : "rgba(52,211,153,0.45)",
  duration: 3.5 + (i % 5) * 0.9,
  delay: (i * 0.38) % 3.5,
}));

// ─── Confetti burst ───────────────────────────────────────────────────────────

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  angle: (i / 28) * 360,
  distance: 60 + (i % 6) * 30,
  size: 6 + (i % 5) * 3,
  color: i % 5 === 0
    ? "#a78bfa"
    : i % 5 === 1
    ? "#38bdf8"
    : i % 5 === 2
    ? "#f472b6"
    : i % 5 === 3
    ? "#fbbf24"
    : "#34d399",
  duration: 0.9 + (i % 4) * 0.2,
  delay: (i % 5) * 0.04,
}));

function deg2rad(d: number) { return (d * Math.PI) / 180; }

export function VFXLayer({
  elapsedMs,
  timeline,
  choicePhase,
  messageCount,
  instantTransitions = false,
  slowFactor = 1,
  aspectRatio = "9:16",
}: Props) {
  const s = slowFactor;
  const T0 = { duration: 0 };

  const choicesActive = choicePhase !== "hidden";
  const isWinner = choicePhase === "winner-a" || choicePhase === "winner-b";
  const isExit   = choicePhase === "exit";

  // Flash triggers when choices first appear (enter phase)
  const showFlash = choicePhase === "enter";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">

      {/* ── Scanline overlay ── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* ── Ambient vignette — deepens during choices ── */}
      <motion.div
        className="absolute inset-0"
        animate={instantTransitions ? {} : {
          opacity: choicesActive && !isExit ? 0.65 : 0.3,
        }}
        transition={instantTransitions ? T0 : { type: "tween", duration: 0.8 * s, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 40%, rgba(4,8,18,0.85) 100%)",
        }}
      />

      {/* ── Ambient colour tint shift — violet when choices, teal on winner ── */}
      <motion.div
        className="absolute inset-0"
        animate={instantTransitions ? {} : {
          opacity: isWinner ? 0.12 : choicesActive && !isExit ? 0.07 : 0,
          background: isWinner
            ? (choicePhase === "winner-a"
              ? "radial-gradient(ellipse 100% 60% at 50% 85%, rgba(124,58,237,0.5) 0%, transparent 70%)"
              : "radial-gradient(ellipse 100% 60% at 50% 85%, rgba(20,184,166,0.5) 0%, transparent 70%)")
            : "radial-gradient(ellipse 100% 50% at 50% 85%, rgba(124,58,237,0.3) 0%, transparent 70%)",
        }}
        transition={instantTransitions ? T0 : { type: "tween", duration: 0.6 * s, ease: "easeInOut" }}
      />

      {/* ── Phase flash — white burst when choices slide in ── */}
      <AnimatePresence>
        {showFlash && !instantTransitions && (
          <motion.div
            key="flash"
            className="absolute inset-0"
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 * s, ease: "easeOut" }}
            style={{ background: "radial-gradient(ellipse 80% 50% at 50% 85%, rgba(167,139,250,0.7) 0%, transparent 65%)" }}
          />
        )}
      </AnimatePresence>

      {/* ── Ambient floating particles ── */}
      {!instantTransitions && AMBIENT.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ left: p.x, top: p.y, width: p.size, height: p.size, background: p.color }}
          animate={{
            y: [0, -(10 + p.size * 3), 0],
            opacity: [0, 0.9, 0],
            scale: [0.6, 1.1, 0.6],
          }}
          transition={{
            duration: p.duration * s,
            repeat: Infinity,
            delay: p.delay * s,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* ── Winner confetti burst ── */}
      <AnimatePresence>
        {isWinner && !instantTransitions && (
          <motion.div
            key={`burst-${choicePhase}`}
            className="absolute"
            style={{ left: "50%", bottom: "30%", transform: "translateX(-50%)" }}
          >
            {CONFETTI.map((c) => {
              const rad = deg2rad(c.angle);
              const tx = Math.cos(rad) * c.distance;
              const ty = -Math.sin(rad) * c.distance;
              return (
                <motion.div
                  key={c.id}
                  className="absolute rounded-sm"
                  style={{ width: c.size, height: c.size * 0.55, background: c.color, left: 0, top: 0 }}
                  initial={{ opacity: 0.9, x: 0, y: 0, scale: 1, rotate: 0 }}
                  animate={{
                    opacity: 0,
                    x: tx,
                    y: ty,
                    scale: 0.3,
                    rotate: c.angle * 2,
                  }}
                  transition={{
                    duration: (c.duration + 0.4) * s,
                    delay: c.delay * s,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Horizontal light streak on winner ── */}
      <AnimatePresence>
        {isWinner && !instantTransitions && (
          <motion.div
            key={`streak-${choicePhase}`}
            className="absolute inset-x-0 h-[3px]"
            style={{
              bottom: "30%",
              background: "linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)",
            }}
            initial={{ scaleX: 0, opacity: 0.8 }}
            animate={{ scaleX: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 * s, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* ── CTA approach glow — warm up before CTA hits ── */}
      {!instantTransitions && (() => {
        const warmStart = timeline.ctaAppearTime - 600;
        const warmProgress = Math.max(0, Math.min(1,
          (elapsedMs - warmStart) / 600
        ));
        return warmProgress > 0 && choicePhase === "exit" ? (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 50% 50%, rgba(124,58,237,${(warmProgress * 0.18).toFixed(3)}) 0%, transparent 70%)`,
            }}
          />
        ) : null;
      })()}

    </div>
  );
}
