"use client";

import { motion } from "framer-motion";
import { LogoMark } from "@/components/brand/Logo";

const dotTransition = {
  duration: 0.9,
  repeat: Infinity,
  ease: "easeInOut" as const,
};

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 px-4">
      <motion.div
        animate={{ rotate: [0, 4, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <LogoMark className="h-14 w-14" />
      </motion.div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-navy-600 dark:bg-navy-300"
            animate={{
              y: [0, -6, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ ...dotTransition, delay: i * 0.15 }}
          />
        ))}
      </div>
      <p className="text-sm text-navy-600 dark:text-navy-300">{label}</p>
    </div>
  );
}

export function InlineSpinner({ className = "" }: { className?: string }) {
  return (
    <motion.span
      className={`inline-block h-5 w-5 rounded-full border-2 border-navy-200 border-t-navy-800 dark:border-navy-700 dark:border-t-navy-100 ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" as const }}
    />
  );
}
