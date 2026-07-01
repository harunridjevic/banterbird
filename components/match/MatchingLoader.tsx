"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";

type Props = { onCancel: () => void };

export function MatchingLoader({ onCancel }: Props) {
  return (
    <div className="w-full px-4 py-6 text-center">
      <motion.div
        className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-navy-200/70 bg-white/80 shadow-lg sm:h-24 sm:w-24 sm:rounded-[2rem] dark:border-white/10 dark:bg-navy-900/40"
        animate={{ scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles className="h-10 w-10 text-navy-900 sm:h-12 sm:w-12 dark:text-navy-100" />
        <motion.span
          className="absolute inset-0 rounded-[1.75rem] border-2 border-navy-900/20 sm:rounded-[2rem] dark:border-white/20"
          animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.1, 1] }}
          transition={{ duration: 2.1, repeat: Infinity }}
        />
      </motion.div>
      <p className="mt-6 text-base font-semibold text-navy-950 sm:mt-8 sm:text-lg dark:text-navy-50">
        Looking for a match…
      </p>
      <p className="mt-2 mx-auto max-w-xs text-sm text-navy-600 dark:text-navy-300">
        Hang tight — we&apos;re pairing you with someone now.
      </p>
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onCancel}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-navy-200"
      >
        <ArrowLeft className="h-4 w-4" /> Cancel
      </motion.button>
    </div>
  );
}
