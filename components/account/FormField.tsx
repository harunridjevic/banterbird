import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  error?: string | null;
};

export function FormField({ label, id, error, className = "", ...rest }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-navy-700 dark:text-navy-300">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-xl border border-navy-200/80 bg-white/80 px-3 py-2.5 text-sm text-navy-950 placeholder:text-navy-400 transition focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-400/20 dark:border-white/10 dark:bg-navy-900/60 dark:text-navy-50 dark:placeholder:text-navy-500 dark:focus:border-navy-500 ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
