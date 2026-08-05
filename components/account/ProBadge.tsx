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
        "inline-flex items-center rounded-md font-bold uppercase tracking-wide",
        "bg-amber-400/90 text-navy-950",
        "dark:bg-amber-300 dark:text-navy-950",
        sizeClass,
        className,
      ].join(" ")}
      title="BanterBird PRO"
    >
      PRO
    </span>
  );
}
