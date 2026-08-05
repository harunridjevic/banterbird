"use client";

import { useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { ProBadge } from "./ProBadge";
import { PRO_PRICE_USD } from "@/lib/billing/constants";

type Props = {
  isPro: boolean;
  proUntil: string | null;
};

function formatUntil(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

/** Subscribe / manage BanterBird PRO inside the account panel. */
export function ProSubscribePanel({ isPro, proUntil }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceUsd, setPriceUsd] = useState<number>(PRO_PRICE_USD);
  const untilLabel = formatUntil(proUntil);

  // Fetch the current price from the server so it reflects any admin changes
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (!res.ok) return;
        const data = (await res.json()) as {
          billing?: { proPriceUsd?: number };
        };
        if (typeof data.billing?.proPriceUsd === "number") {
          setPriceUsd(data.billing.proPriceUsd);
        }
      } catch {
        // Non-fatal — fall back to the compile-time constant
      }
    })();
  }, []);

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { invoiceUrl?: string; error?: string };
      if (!res.ok || !data.invoiceUrl) {
        setError(data.error ?? "Could not start checkout.");
        setLoading(false);
        return;
      }
      window.location.href = data.invoiceUrl;
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-navy-200/70 bg-gradient-to-br from-amber-50/80 to-white/60 p-4 dark:border-white/10 dark:from-amber-950/20 dark:to-navy-900/40">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/90 text-navy-950">
          <Crown className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-navy-950 dark:text-navy-50">
              BanterBird PRO
            </p>
            {isPro && <ProBadge size="sm" />}
          </div>
          {isPro ? (
            <p className="mt-1 text-xs text-navy-600 dark:text-navy-300">
              You&apos;re on PRO
              {untilLabel ? ` until ${untilLabel}` : ""}. More perks coming soon.
            </p>
          ) : (
            <p className="mt-1 text-xs text-navy-600 dark:text-navy-300">
              ${priceUsd}/month. Pay with debit or credit card — funds settle
              to crypto. Benefits will expand over time.
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => void startCheckout()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-amber-400 dark:text-navy-950 dark:hover:bg-amber-300"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirecting…
          </>
        ) : isPro ? (
          `Extend PRO — $${priceUsd}`
        ) : (
          `Subscribe — $${priceUsd}/mo`
        )}
      </button>

      {error && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
