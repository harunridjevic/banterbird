"use client";

import { Crown } from "lucide-react";

type Props = {
  className?: string;
  size?: "sm" | "md";
};

/** PRO badge — styled to match the "Remove Ads" button. */
export function ProBadge({ className = "", size = "sm" }: Props) {
  const sizeClass =
    size === "md"
      ? "px-3 py-2 text-xs gap-2"
      : "px-2.5 py-1.5 text-xs gap-1.5";

  const iconSize =
    size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <span
      className={[
        "inline-flex items-center font-semibold rounded-xl border transition",
        "border-amber-400/60 bg-amber-400/10 text-amber-700",
        "dark:border-amber-400/30 dark:text-amber-400 dark:bg-transparent",
        sizeClass,
        className,
      ].join(" ")}
      title="BanterBird PRO"
    >
      <Crown className={iconSize} />
      PRO
    </span>
  );
}
