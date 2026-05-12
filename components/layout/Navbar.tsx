"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useSyncExternalStore, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { OnlineCountPill } from "@/components/presence/OnlineCountPill";

const nav = [
  { href: "/match", label: "Start chatting" },
];

export function Navbar() {
  const { setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <header className="sticky top-0 z-50 border-b border-navy-200/60 bg-[var(--glass-bg)] backdrop-blur-xl dark:border-white/10">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Logo showWordmark priority className="shrink-0 scale-90 sm:scale-100" />

        <div className="flex min-w-0 flex-1 justify-center px-1">
          <OnlineCountPill />
        </div>

        <nav className="hidden shrink-0 items-center gap-2 md:flex">
          {nav.map((item) => (
            <motion.div key={item.href} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href={item.href}
                className="rounded-2xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-800 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
              >
                {item.label}
              </Link>
            </motion.div>
          ))}
          <button
            type="button"
            aria-label="Toggle dark mode"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-navy-200/80 bg-white/50 text-navy-900 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-100 dark:hover:bg-navy-800"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {mounted ? (
              resolvedTheme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )
            ) : (
              <Moon className="h-5 w-5 opacity-40" />
            )}
          </button>
        </nav>

        <div className="flex shrink-0 items-center gap-2 md:hidden">
          <button
            type="button"
            aria-label="Toggle dark mode"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-navy-200/80 bg-white/50 dark:border-white/10 dark:bg-navy-900/50"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-navy-200/80 bg-white/50 dark:border-white/10 dark:bg-navy-900/50"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-navy-200/60 bg-[var(--page-bg)] px-4 py-4 dark:border-white/10 md:hidden"
        >
          <Link
            href="/match"
            className="block rounded-2xl bg-navy-900 py-3 text-center text-sm font-semibold text-white dark:bg-navy-100 dark:text-navy-950"
            onClick={() => setOpen(false)}
          >
            Start chatting
          </Link>
        </motion.div>
      ) : null}
    </header>
  );
}
