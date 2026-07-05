"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

type LogoProps = {
  showWordmark?: boolean;
  className?: string;
  priority?: boolean;
};

function LogoImage({ isDark, priority }: { isDark: boolean; priority: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="relative h-12 w-36 sm:h-14 sm:w-44"
    >
      <Image
        src="/banterbird-logo.png"
        alt="BanterBird"
        fill
        className={`object-contain object-left transition-[filter] duration-200 ${
          isDark ? "" : "invert"
        }`}
        sizes="(max-width: 640px) 144px, 176px"
        priority={priority}
      />
    </motion.div>
  );
}

export function Logo({
  showWordmark = true,
  className = "",
  priority = false,
}: LogoProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isDark = !mounted || resolvedTheme === "dark";
  const pathname = usePathname();
  const onMatchPage = pathname === "/match" || pathname.startsWith("/match/");

  const startMatching = () => {
    window.dispatchEvent(new CustomEvent("banterbird:start-matching"));
  };

  if (onMatchPage) {
    return (
      <button
        type="button"
        onClick={startMatching}
        className={`group inline-flex flex-col items-center gap-1 ${className}`}
        aria-label="Start matching on BanterBird"
      >
        <LogoImage isDark={isDark} priority={priority} />
        {!showWordmark ? <span className="sr-only">BanterBird</span> : null}
      </button>
    );
  }

  return (
    <Link href="/match" className={`group inline-flex flex-col items-center gap-1 ${className}`}>
      <LogoImage isDark={isDark} priority={priority} />
      {!showWordmark ? <span className="sr-only">BanterBird</span> : null}
    </Link>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isDark = !mounted || resolvedTheme === "dark";

  return (
    <div className={`relative h-9 w-9 shrink-0 ${className}`}>
      <Image
        src="/banterbird-logo.png"
        alt=""
        fill
        className={`object-contain transition-[filter] duration-200 ${isDark ? "" : "invert"}`}
        sizes="36px"
      />
    </div>
  );
}
