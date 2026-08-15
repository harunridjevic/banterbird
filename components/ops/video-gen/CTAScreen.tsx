"use client";

/**
 * CTAScreen
 *
 * The final "end card" that fades in over the chat after the response phase.
 * Displays:
 *   - BanterBird bird icon + wordmark (large)
 *   - Headline (e.g. "More conversations like this on BanterBird")
 *   - Subline (e.g. "Speak to strangers. Free. No login.")
 *   - Subtle animated background shimmer for visual polish
 */

import { motion } from "framer-motion";

interface Props {
  headline: string;
  subline: string;
  visible: boolean;
}

export function CTAScreen({ headline, subline, visible }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.55, ease: "easeInOut" }}
      aria-hidden={!visible}
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
      style={{
        /*
         * Match the VideoTemplate safe-zone so the CTA content centres
         * within the inner card frame, not across the full 9:16 frame.
         * padding shorthand: top right bottom left
         */
        padding: "8% 8% 22% 8%",
        background:
          "linear-gradient(160deg, #0c121c 0%, #141f2e 50%, #0c121c 100%)",
      }}
    >
      {/* Animated radial glow */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        animate={
          visible
            ? { opacity: [0.4, 0.65, 0.4] }
            : { opacity: 0 }
        }
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(124,58,237,0.22) 0%, transparent 70%)",
        }}
      />

      {/* Horizontal scan line shimmer */}
      {visible && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 h-px"
          initial={{ top: "20%", opacity: 0 }}
          animate={{ top: "80%", opacity: [0, 0.18, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: 0.4 }}
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(167,139,250,0.6), transparent)",
          }}
        />
      )}

      {/* Content */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={visible ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        className="relative flex flex-col items-center gap-5 text-center"
      >
        {/* Bird icon → real app logo */}
        <div
          className="flex items-center justify-center rounded-[28px] px-5 py-4"
          style={{
            background: "rgba(124,58,237,0.15)",
            border: "1.5px solid rgba(124,58,237,0.3)",
            boxShadow: "0 8px 32px rgba(124,58,237,0.25)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banterbird-logo.png"
            alt="BanterBird"
            style={{ height: 36, width: "auto", objectFit: "contain" }}
          />
        </div>

        {/* Divider */}
        <div
          className="h-px w-16"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(167,139,250,0.5), transparent)",
          }}
        />

        {/* Headline */}
        <p
          className="text-[22px] font-black leading-tight tracking-tight"
          style={{ color: "#e8ecf2" }}
        >
          {headline}
        </p>

        {/* Subline */}
        <p
          className="text-[15px] font-medium leading-snug"
          style={{ color: "#7a8bad" }}
        >
          {subline}
        </p>

        {/* URL pill */}
        <div
          className="mt-1 rounded-full px-5 py-2"
          style={{
            background: "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.35)",
          }}
        >
          <span
            className="text-[13px] font-bold tracking-wide"
            style={{ color: "#a78bfa" }}
          >
            BanterBird.app
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
