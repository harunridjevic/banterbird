"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, CreditCard, Loader2, X } from "lucide-react";
import { PRO_PRICE_USD } from "@/lib/billing/constants";
import { useAccount } from "@/lib/account/context";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: "sandbox" | "production") => void };
      Initialize: (opts: {
        token: string;
        eventCallback?: (event: { name: string; data?: unknown }) => void;
      }) => void;
      Checkout: {
        open: (opts: {
          transactionId: string;
          settings?: { displayMode?: string; variant?: string };
          customer?: { email?: string; address?: { countryCode?: string } };
        }) => void;
      };
    };
  }
}

type CheckoutResponse = {
  ok?: boolean;
  transactionId?: string;
  clientToken?: string;
  customerEmail?: string | null;
  countryCode?: string | null;
  sandbox?: boolean;
  error?: string;
};

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

export function ProSubscribePanel({ isPro, proUntil }: Props) {
  const { refresh } = useAccount();
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [priceUsd, setPriceUsd] = useState<number>(PRO_PRICE_USD);
  const paddleLoaded = useRef(false);
  const untilLabel = formatUntil(proUntil);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (!res.ok) return;
        const data = (await res.json()) as { billing?: { proPriceUsd?: number } };
        if (typeof data.billing?.proPriceUsd === "number") setPriceUsd(data.billing.proPriceUsd);
      } catch { /* fall back to constant */ }
    })();
  }, []);

  function loadPaddleScript(token: string, sandbox: boolean): Promise<void> {
    return new Promise((resolve) => {
      if (paddleLoaded.current && window.Paddle) { resolve(); return; }
      const existing = document.getElementById("paddle-js");
      if (existing) {
        // Script already in DOM — just resolve, caller will Initialize
        paddleLoaded.current = true;
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.id = "paddle-js";
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.onload = () => {
        // Set environment only — do NOT Initialize here.
        // Caller sets up eventCallback then calls Initialize once.
        if (sandbox) window.Paddle?.Environment.set("sandbox");
        paddleLoaded.current = true;
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as CheckoutResponse;
      if (!res.ok || !data.transactionId || !data.clientToken) {
        setError(data.error ?? "Could not start checkout.");
        setLoading(false);
        return;
      }
      await loadPaddleScript(data.clientToken, data.sandbox ?? false);
      if (!window.Paddle) {
        setError("Payment system failed to load. Please refresh and try again.");
        setLoading(false);
        return;
      }
      if (data.sandbox) window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({
        token: data.clientToken,
        eventCallback: (event) => {
          if (event.name === "checkout.completed") {
            void (async () => {
              for (let i = 0; i < 6; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                await refresh();
              }
            })();
          }
        },
      });
      window.Paddle.Checkout.open({
        transactionId: data.transactionId,
        settings: { displayMode: "overlay", variant: "one-page" },
        ...(data.customerEmail || data.countryCode
          ? {
              customer: {
                ...(data.customerEmail ? { email: data.customerEmail } : {}),
                ...(data.countryCode ? { address: { countryCode: data.countryCode } } : {}),
              },
            }
          : {}),
      });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRenewal = async () => {
    setCancelLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; proUntil?: string | null; error?: string };
      if (!res.ok) { setError(data.error ?? "Could not cancel renewal."); return; }
      setCancelSuccess(true);
      setConfirmCancel(false);
      await refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleChangeCard = async () => {
    setCardLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/update-payment", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; portalUrl?: string; error?: string };
      if (!res.ok || !data.portalUrl) { setError(data.error ?? "Could not open payment portal."); return; }
      window.open(data.portalUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setCardLoading(false);
    }
  };

  // PRO active state
  if (isPro) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-50/80 to-white/60 p-4 dark:border-amber-500/20 dark:from-amber-950/20 dark:to-navy-900/40">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/90 text-navy-950">
            <Crown className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy-950 dark:text-navy-50">BanterBird PRO</p>
            {cancelSuccess ? (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                Renewal cancelled. You have PRO access until{" "}
                {untilLabel ?? "the end of your billing period"}.
              </p>
            ) : (
              <p className="mt-1 text-xs text-navy-600 dark:text-navy-300">
                Active{untilLabel ? ` · renews ${untilLabel}` : ""}. Ad-free · PRO badge.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
        )}

        {/* Change card — re-enable when Paddle portal is working correctly */}
        {/* {!cancelSuccess && (
          <button
            type="button"
            disabled={cardLoading}
            onClick={() => void handleChangeCard()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-navy-200/70 px-3 py-2 text-sm font-medium text-navy-700 transition hover:bg-navy-50 disabled:opacity-60 dark:border-white/10 dark:text-navy-300 dark:hover:bg-navy-800/50"
          >
            {cardLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CreditCard className="h-4 w-4" />}
            Change payment card
          </button>
        )} */}

        {/* Cancel renewal */}
        {!cancelSuccess && (
          confirmCancel ? (
            <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-50/60 p-3 dark:border-rose-500/20 dark:bg-rose-950/20">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Cancel renewal?</p>
              <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/70">
                Your PRO access continues until{" "}
                {untilLabel ?? "the end of your billing period"}. No future charges.
                Current period is non-refundable — for refund requests email{" "}
                <a href="mailto:support@banterbird.app" className="underline">
                  support@banterbird.app
                </a>.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={cancelLoading}
                  onClick={() => void handleCancelRenewal()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {cancelLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : "Yes, cancel renewal"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="rounded-xl border border-navy-200/70 px-3 py-2 text-xs font-semibold text-navy-600 transition hover:bg-navy-100 dark:border-white/10 dark:text-navy-400 dark:hover:bg-navy-800"
                >
                  Keep PRO
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs text-navy-400 underline-offset-2 transition hover:text-rose-500 hover:underline dark:text-navy-500 dark:hover:text-rose-400"
            >
              <X className="h-3 w-3" />
              Turn off auto-renewal
            </button>
          )
        )}
      </div>
    );
  }

  // Non-PRO state
  return (
    <div className="rounded-2xl border border-navy-200/70 bg-gradient-to-br from-amber-50/80 to-white/60 p-4 dark:border-white/10 dark:from-amber-950/20 dark:to-navy-900/40">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/90 text-navy-950">
          <Crown className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy-950 dark:text-navy-50">BanterBird PRO</p>
          <p className="mt-1 text-xs text-navy-600 dark:text-navy-300">
            ${priceUsd}/month · Ad-free · PRO badge · Cancel anytime.
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => void startCheckout()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-amber-400 dark:text-navy-950 dark:hover:bg-amber-300"
      >
        {loading
          ? <><Loader2 className="h-4 w-4 animate-spin" />Opening checkout…</>
          : `Subscribe — $${priceUsd}/mo`}
      </button>

      {error && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
      )}
    </div>
  );
}
