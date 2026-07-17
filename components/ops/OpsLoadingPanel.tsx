"use client";

const PAGE_SIZE = 25;

export { PAGE_SIZE };

export function OpsLoadingPanel({
  label = "Loading…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${compact ? "py-10" : "min-h-[40vh] py-16"}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-navy-300"
        aria-hidden
      />
      <p className="text-sm text-navy-400">{label}</p>
    </div>
  );
}
