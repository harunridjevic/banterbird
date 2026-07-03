"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Logo } from "@/components/brand/Logo";
import { OnlineCountPill } from "@/components/presence/OnlineCountPill";

export function Navbar() {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-navy-200/60 bg-[var(--glass-bg)] backdrop-blur-xl dark:border-white/10">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Logo showWordmark priority className="relative z-10 shrink-0 scale-90 sm:scale-100" />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-28 sm:px-36">
          <div className="pointer-events-auto">
            <OnlineCountPill />
          </div>
        </div>

        <button
          type="button"
          aria-label="Toggle dark mode"
          className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-navy-200/80 bg-white/70 text-navy-900 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-100 dark:hover:bg-navy-800"
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
      </div>
    </header>
  );
}
