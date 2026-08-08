"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Crown, Shuffle, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called when the user clicks "Upgrade to PRO" */
  onUpgrade: () => void;
};

export function GenderExhaustedModal({ open, onClose, onUpgrade }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="gender-exhausted-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            key="gender-exhausted-panel"
            initial={{ opacity: 0, scale: 0.93, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 24 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed inset-x-4 top-1/2 z-[201] mx-auto max-w-sm -translate-y-1/2 rounded-3xl border border-navy-200/60 bg-white shadow-2xl dark:border-white/10 dark:bg-navy-950"
          >
            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-navy-400 transition hover:bg-navy-100 dark:text-navy-500 dark:hover:bg-navy-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="px-6 pb-6 pt-8">
              {/* Icon */}
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/40">
                <Shuffle className="h-7 w-7 text-amber-500" />
              </div>

              <h2 className="text-lg font-bold text-navy-950 dark:text-white">
                Gender matches used up
              </h2>
              <p className="mt-2 text-sm text-navy-600 dark:text-navy-400">
                You&apos;ve used all{" "}
                <span className="font-semibold text-navy-900 dark:text-white">10 gender-based matches</span>{" "}
                for today. We&apos;ve switched you to a &quot;Regardless&quot; match automatically.
              </p>

              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-navy-50 px-4 py-3 dark:bg-navy-900/40">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-navy-400" />
                <p className="text-xs text-navy-600 dark:text-navy-400">
                  Your gender match allowance resets every day at midnight UTC. Come back tomorrow for 10 more.
                </p>
              </div>

              <div className="mt-5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => { onClose(); onUpgrade(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-navy-950 shadow-lg transition hover:bg-amber-300"
                >
                  <Crown className="h-4 w-4" />
                  Upgrade to PRO — unlimited gender matching
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-2xl py-2.5 text-sm font-medium text-navy-500 transition hover:text-navy-800 dark:text-navy-400 dark:hover:text-navy-200"
                >
                  Continue with Regardless match
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
