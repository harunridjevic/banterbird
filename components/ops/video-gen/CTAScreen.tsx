"use client";

import { motion } from "framer-motion";
import type { VideoAspectRatio } from "@/lib/ops/video-generator-types";

interface Props {
  headline: string;
  subline: string;
  visible: boolean;
  instantTransitions?: boolean;
  slowFactor?: number;
  exportOpacity?: number;
  aspectRatio?: VideoAspectRatio;
}

export function CTAScreen({
  headline,
  subline,
  visible,
  instantTransitions = false,
  slowFactor = 1,
  exportOpacity,
  aspectRatio = "9:16",
}: Props) {
  const s = slowFactor;
  const T0 = { duration: 0 };
  const isExportMode = exportOpacity !== undefined;
  const isWidescreen = aspectRatio === "16:9";

  const outerOpacity = isExportMode ? exportOpacity : (visible ? 1 : 0);
  const outerTransition = instantTransitions || isExportMode
    ? T0
    : { type: "tween" as const, duration: 0.55 * s, ease: "easeInOut" as const };

  const inner = (delayFraction: number) => {
    if (isExportMode) {
      const t = Math.max(0, (exportOpacity! - delayFraction) / (1 - delayFraction + 0.001));
      return Math.min(1, t);
    }
    return visible ? 1 : 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: outerOpacity }}
      transition={outerTransition}
      aria-hidden={!visible && !isExportMode}
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
      style={{
        padding: isWidescreen ? "4% 6%" : "8% 8% 22% 8%",
        background: "linear-gradient(160deg, rgba(8,14,24,0.94) 0%, rgba(15,26,46,0.96) 50%, rgba(8,14,24,0.94) 100%)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Floating particles */}
      {!instantTransitions && !isExportMode && [0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{
            width: isWidescreen ? 3 + i * 2 : 4 + i * 3,
            height: isWidescreen ? 3 + i * 2 : 4 + i * 3,
            background: i % 2 === 0 ? "rgba(167,139,250,0.6)" : "rgba(45,212,191,0.5)",
            left: `${15 + i * 17}%`, top: `${20 + (i % 3) * 20}%`,
          }}
          animate={visible ? { y: [0, -18, 0], opacity: [0, 0.8, 0], scale: [0.5, 1.2, 0.5] } : { opacity: 0 }}
          transition={{ duration: (1.8 + i * 0.4) * s, repeat: Infinity, delay: i * 0.35 * s, ease: "easeInOut" }}
        />
      ))}

      {/* Radial glow */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={visible ? { opacity: [0.3, 0.6, 0.3] } : { opacity: 0 }}
        transition={instantTransitions ? T0 : { duration: 2.5 * s, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(124,58,237,0.28) 0%, transparent 70%)" }}
      />

      {/* Scan line */}
      {visible && !instantTransitions && !isExportMode && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 h-[2px]"
          initial={{ top: "10%", opacity: 0 }}
          animate={{ top: "90%", opacity: [0, 0.25, 0] }}
          transition={{ duration: 2.2 * s, repeat: Infinity, ease: "linear", delay: 0.5 * s }}
          style={{ background: "linear-gradient(to right, transparent, rgba(167,139,250,0.8), rgba(45,212,191,0.6), transparent)" }}
        />
      )}

      {/* Content */}
      <div className={`relative flex flex-col items-center text-center ${isWidescreen ? "gap-3" : "gap-5"}`}>

        {/* Logo box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 24 }}
          animate={isExportMode
            ? { opacity: inner(0), scale: inner(0) * 0.35 + 0.65, y: (1 - inner(0)) * 24 }
            : visible ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.7, y: 24 }
          }
          transition={instantTransitions || isExportMode ? T0 : {
            type: "spring",
            stiffness: Math.max(60, 300 / s),
            damping: Math.max(8, 20 / s),
          }}
          className={`flex items-center justify-center ${
            isWidescreen ? "rounded-2xl px-3.5 py-2.5" : "rounded-3xl px-5 py-4"
          }`}
          style={{
            background: "#1e1a3d",
            border: "2px solid rgba(167,139,250,0.6)",
            boxShadow: "0 12px 40px rgba(124,58,237,0.35)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banterbird-logo.png"
            alt="BanterBird"
            style={{ height: isWidescreen ? 24 : 36, width: "auto", objectFit: "contain" }}
          />
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={isExportMode
            ? { opacity: inner(0.15), scaleX: inner(0.15) }
            : visible ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }
          }
          transition={instantTransitions || isExportMode ? T0 : { type: "tween", duration: 0.4 * s, ease: "easeOut", delay: 0.15 * s }}
          className={`h-px ${isWidescreen ? "w-14" : "w-20"}`}
          style={{ background: "linear-gradient(to right, transparent, rgba(167,139,250,0.6), rgba(45,212,191,0.4), transparent)" }}
        />

        {/* Headline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isExportMode
            ? { opacity: inner(0.25), y: (1 - inner(0.25)) * 20 }
            : visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
          }
          transition={instantTransitions || isExportMode ? T0 : {
            type: "spring", stiffness: Math.max(60, 260 / s), damping: Math.max(8, 22 / s), delay: 0.2 * s,
          }}
          className={`${isWidescreen ? "text-[15px]" : "text-[22px]"} font-black leading-tight tracking-tight`}
          style={{ color: "#e8ecf2" }}
        >
          {headline}
        </motion.p>

        {/* Subline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={isExportMode
            ? { opacity: inner(0.38), y: (1 - inner(0.38)) * 16 }
            : visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }
          }
          transition={instantTransitions || isExportMode ? T0 : {
            type: "spring", stiffness: Math.max(60, 240 / s), damping: Math.max(8, 22 / s), delay: 0.3 * s,
          }}
          className={`${isWidescreen ? "text-[11px]" : "text-[15px]"} font-medium leading-snug`}
          style={{ color: "#8a9bbf" }}
        >
          {subline}
        </motion.p>

        {/* URL pill */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={isExportMode
            ? { opacity: inner(0.5), scale: inner(0.5) * 0.2 + 0.8 }
            : visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }
          }
          transition={instantTransitions || isExportMode ? T0 : {
            type: "spring", stiffness: Math.max(60, 320 / s), damping: Math.max(8, 18 / s), delay: 0.4 * s,
          }}
          className={`mt-1 rounded-full ${isWidescreen ? "px-3.5 py-1" : "px-5 py-2"}`}
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(20,184,166,0.15) 100%)",
            border: "1px solid rgba(167,139,250,0.45)",
            boxShadow: "0 4px 20px rgba(124,58,237,0.25)",
          }}
        >
          <span className={`${isWidescreen ? "text-[11px]" : "text-[13px]"} font-bold tracking-wide`} style={{ color: "#c4b5fd" }}>
            BanterBird.app
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}
