"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex max-w-md flex-col items-center gap-4 rounded-3xl border border-navy-200/70 bg-white/40 px-6 py-10 text-center dark:border-white/10 dark:bg-navy-900/30"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900/5 text-navy-800 dark:bg-white/10 dark:text-navy-100">
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-navy-950 dark:text-navy-50">{title}</h2>
        <p className="text-sm leading-relaxed text-navy-600 dark:text-navy-300">{description}</p>
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </motion.div>
  );
}
