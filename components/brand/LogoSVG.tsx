"use client";

import { useTheme } from "next-themes";

type LogoProps = {
  showWordmark?: boolean;
  className?: string;
  priority?: boolean;
};

export function Logo({ showWordmark = true, className = "", priority = false }: LogoProps) {
  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <div className="relative h-10 w-36 sm:h-12 sm:w-44">
        <LogoIcon />
      </div>
      {showWordmark && <LogoWordmark />}
    </div>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-8 w-8 shrink-0 ${className}`}>
      <LogoIcon />
    </div>
  );
}

function LogoIcon() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <svg viewBox="0 0 176 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <defs>
        <linearGradient id="birdGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isDark ? "#60a5fa" : "#2563eb"} />
          <stop offset="100%" stopColor={isDark ? "#a78bfa" : "#7c3aed"} />
        </linearGradient>
      </defs>
      
      {/* Bird body */}
      <path
        d="M24 8C16 8 10 14 10 22C10 30 16 36 24 36C28 36 32 34 34 30L38 32L36 28C38 24 38 20 36 16L40 14L36 12C34 8 30 8 24 8Z"
        fill="url(#birdGradient)"
      />
      
      {/* Wing */}
      <path
        d="M24 14C20 14 18 18 18 22C18 26 20 28 24 28"
        stroke={isDark ? "#f1f5f9" : "#0f172a"}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      
      {/* Eye */}
      <circle cx="28" cy="20" r="1.5" fill={isDark ? "#0f172a" : "#f1f5f9"} />
      
      {/* Beak */}
      <path d="M36 22L40 24L36 26" stroke={isDark ? "#fbbf24" : "#f59e0b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoWordmark() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <span
      className="text-lg font-bold tracking-tight sm:text-xl"
      style={{
        background: `linear-gradient(135deg, ${isDark ? '#60a5fa' : '#2563eb'} 0%, ${isDark ? '#a78bfa' : '#7c3aed'} 100%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text'
      }}
    >
      BanterBird
    </span>
  );
}