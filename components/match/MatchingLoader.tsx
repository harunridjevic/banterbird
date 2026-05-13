"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";

type Props = { onCancel: () => void };

export function MatchingLoader({ onCancel }: Props) {
  return (
    <div className="flex flex-col items-center justify-center flex-1">
      <motion.div
        className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-navy-200/60 bg-white/50 shadow-lg dark:border-white/10 dark:bg-navy-900/40"
        animate={{ scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles className="h-12 w-12 text-navy-800 dark:text-navy-100" />
        <motion.span
          className="absolute inset-0 rounded-[2rem] border-2 border-navy-900/20 dark:border-white/20"
          animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.1, 1] }}
          transition={{ duration: 2.1, repeat: Infinity }}
        />
      </motion.div>
      <p className="mt-8 text-lg font-semibold text-navy-800 dark:text-navy-100">
        Finding your vibe...
      </p>
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onCancel}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-navy-200"
      >
        <ArrowLeft className="h-4 w-4" /> Cancel
      </motion.button>
    </div>
  );
}