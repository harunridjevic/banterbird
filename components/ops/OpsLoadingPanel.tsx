"use client";

import { motion } from "framer-motion";
import { LogoMark } from "@/components/brand/Logo";

const PAGE_SIZE = 25;

export { PAGE_SIZE };

export function OpsLoadingPanel({
  label = "Loading…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 ${compact ? "py-10" : "min-h-[40vh] py-16"}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="relative">
        <motion.div
          className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="relative rounded-full border border-white/10 bg-navy-900/60 p-4"
        >
          <LogoMark className="h-10 w-10" />
        </motion.div>
        <motion.span
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#0c121c] bg-violet-400"
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-violet-400"
            animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }}
          />
        ))}
      </div>
      <p className="text-sm text-navy-300">{label}</p>
    </div>
  );
}
