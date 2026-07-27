"use client";

import { CheckCircle, Loader, XCircle } from "lucide-react";
import { useUsernameCheck } from "@/lib/hooks/use-username-check";

type Props = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  currentUsername?: string | null;
  currentUserId?: string | null;
  required?: boolean;
  disabled?: boolean;
};

export function UsernameField({
  id,
  value,
  onChange,
  currentUsername,
  required,
  disabled,
}: Props) {
  const { status, message } = useUsernameCheck(value, currentUsername);

  const borderColor =
    status === "available"
      ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-400/20"
      : status === "taken" || status === "invalid"
        ? "border-rose-500 focus:border-rose-500 focus:ring-rose-400/20"
        : "border-navy-200/80 focus:border-navy-400 focus:ring-navy-400/20";

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-navy-700 dark:text-navy-300">
        Username
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="username"
          placeholder="coolbird42"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          className={`w-full rounded-xl border bg-white/80 px-3 py-2.5 pr-9 text-sm text-navy-950 placeholder:text-navy-400 transition focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-navy-900/60 dark:text-navy-50 dark:placeholder:text-navy-500 ${borderColor}`}
        />
        {/* Status icon */}
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {status === "checking" && <Loader className="h-4 w-4 animate-spin text-navy-400" />}
          {status === "available" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
          {(status === "taken" || status === "invalid") && <XCircle className="h-4 w-4 text-rose-500" />}
        </div>
      </div>
      {message && (
        <p className={`text-xs ${
          status === "available" ? "text-emerald-600 dark:text-emerald-400"
          : status === "taken" || status === "invalid" ? "text-rose-600 dark:text-rose-400"
          : "text-navy-500 dark:text-navy-400"
        }`}>
          {message}
        </p>
      )}
    </div>
  );
}
