"use client";

type Props = {
  className?: string;
  size?: "sm" | "md";
};

/** Compact PRO badge for navbar / profile. */
export function ProBadge({ className = "", size = "sm" }: Props) {
  const sizeClass =
    size === "md"
      ? "px-2 py-0.5 text-[11px]"
      : "px-1.5 py-px text-[10px]";

  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full border font-bold uppercase tracking-wide shadow-sm",
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
