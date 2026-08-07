"use client";

type Props = {
  className?: string;
  size?: "sm" | "md";
};

/** Compact PRO badge — styled to match the OnlineCountPill dimensions. */
export function ProBadge({ className = "", size = "sm" }: Props) {
  const sizeClass =
    size === "md"
      ? "px-3 py-1.5 text-xs sm:px-3.5 sm:text-sm"
      : "px-3 py-1.5 text-xs sm:px-3.5 sm:text-sm";

  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full border font-semibold shadow-sm",
        "border-amber-400/80 bg-amber-400/90 text-navy-950",
        "dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-300",
        sizeClass,
        className,
      ].join(" ")}
      title="BanterBird PRO"
    >
      PRO
    </span>
  );
}
