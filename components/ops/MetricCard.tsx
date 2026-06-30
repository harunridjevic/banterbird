"use client";

import { HelpCircle } from "lucide-react";

export function MetricTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <HelpCircle
        className="h-3.5 w-3.5 cursor-help text-navy-500 transition hover:text-navy-300"
        aria-hidden
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-navy-950 px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-navy-200 shadow-xl group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

export function MetricCard({
  label,
  value,
  tooltip,
  accent,
}: {
  label: string;
  value: string;
  tooltip: string;
  accent?: "violet" | "emerald" | "sky" | "amber" | "rose";
}) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-500/20"
      : accent === "sky"
        ? "border-sky-500/20"
        : accent === "amber"
          ? "border-amber-500/20"
          : accent === "rose"
            ? "border-rose-500/20"
            : "border-violet-500/20";

  return (
    <div className={`rounded-xl border bg-black/20 p-4 ${accentClass}`}>
      <dt className="flex items-center text-xs font-medium uppercase tracking-wide text-navy-400">
        {label}
        <MetricTip text={tooltip} />
      </dt>
      <dd className="mt-2 text-2xl font-bold tabular-nums text-white">{value}</dd>
    </div>
  );
}
