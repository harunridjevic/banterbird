"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, X, ImageIcon, Sliders, Zap } from "lucide-react";
import { PRO_PRICE_USD } from "@/lib/billing/constants";
import { useAccount } from "@/lib/account/context";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: "production" | "sandbox") => void };
      Initialize: (opts: { token: string; eventCallback?: (event: { name: string; data?: unknown }) => void }) => void;
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

type Props = {
  open: boolean;
  onClose: () => void;
};

const FEATURES = [
  {
    icon: <ImageIcon className="h-5 w-5" />,
    title: "Unlimited image sending",
    desc: "Send as many images as you want — free users are limited to 1 image per day.",
  },
  {
    icon: <Sliders className="h-5 w-5" />,
    title: "Unlimited gender-based matching",
    desc: "Match with men or women as many times as you like. Free users get 10 per day.",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "No ads, ever",
    desc: "Browse and chat completely ad-free — no banners, no video ads.",
  },
  {
    icon: <Crown className="h-5 w-5" />,
    title: "Exclusive PRO badge",
    desc: "Stand out with a golden PRO badge on your profile and next to your name.",
  },
];

export function UpgradeModal({ open, onClose }: Props) {
  const { refresh, openModal } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [priceUsd, setPriceUsd] = useState(PRO_PRICE_USD);
  const paddleLoaded = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (!res.ok) return;
        const data = (await res.json()) as { billing?: { proPriceUsd?: number } };
        if (typeof data.billing?.proPriceUsd === "number") setPriceUsd(data.billing.proPriceUsd);
      } catch { /* fall back */ }
    })();
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) {
      setLoginPrompt(false);
      return;
    }
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function loadPaddleScript(token: string, sandbox: boolean): Promise<void> {
    return new Promise((resolve) => {
      if (paddleLoaded.current && window.Paddle) { resolve(); return; }
      const existing = document.getElementById("paddle-js");
      if (existing) { resolve(); return; }
      const script = document.createElement("script");
      script.id = "paddle-js";
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.onload = () => {
        if (sandbox) window.Paddle?.Environment.set("sandbox");
        window.Paddle?.Initialize({ token });
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
      const data = (await res.json()) as {
        transactionId?: string;
        clientToken?: string;
        customerEmail?: string | null;
        countryCode?: string | null;
        sandbox?: boolean;
        error?: string;
      };

      if (!res.ok || !data.transactionId || !data.clientToken) {
        if (res.status === 401) {
          // Not signed in — show in-modal prompt before redirecting to login
          setLoginPrompt(true);
          setLoading(false);
          return;
        }
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
        eventCallback: (event: { name: string; data?: unknown }) => {
          if (event.name === "checkout.completed") {
            void (async () => {
              for (let i = 0; i < 6; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                await refresh();
              }
              onClose();
              openModal();
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

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.93, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 24 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed inset-x-4 top-1/2 z-[201] mx-auto max-w-md -translate-y-1/2 rounded-3xl border border-amber-300/30 bg-white shadow-2xl dark:border-amber-500/20 dark:bg-navy-950"
          >
            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-navy-400 transition hover:bg-navy-100 dark:text-navy-500 dark:hover:bg-navy-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="px-6 pb-0 pt-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-navy-950 shadow-lg">
                  <Crown className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">
                    BanterBird PRO
                  </p>
                  <h2 className="text-xl font-bold text-navy-950 dark:text-white">
                    Remove ads &amp; unlock more
                  </h2>
                </div>
              </div>
              <p className="mt-3 text-sm text-navy-500 dark:text-navy-400">
                BanterBird is free because of ads. Upgrade to PRO to remove them and unlock unlimited image sending, unlimited gender matching, and an exclusive badge — for just ${priceUsd}/month.
              </p>
            </div>

            {/* Features */}
            <ul className="mt-5 space-y-2 px-6">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex items-start gap-3 rounded-2xl bg-amber-50/80 px-4 py-3 dark:bg-amber-950/20">
                  <span className="mt-0.5 shrink-0 text-amber-500">{f.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-navy-900 dark:text-navy-50">{f.title}</p>
                    <p className="mt-0.5 text-xs text-navy-500 dark:text-navy-400">{f.desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="px-6 pb-6 pt-4">
              {loginPrompt ? (
                <div className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-50/80 px-4 py-3 dark:bg-amber-950/20">
                  <p className="text-sm font-semibold text-navy-900 dark:text-navy-50">
                    You need to be logged in to upgrade
                  </p>
                  <p className="mt-0.5 text-xs text-navy-500 dark:text-navy-400">
                    Create a free account or sign in first, then come back to unlock PRO.
                  </p>
                  <button
                    type="button"
                    onClick={() => { onClose(); openModal(); }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3 text-sm font-bold text-navy-950 shadow-lg transition hover:bg-amber-300"
                  >
                    Sign in / Create account
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginPrompt(false)}
                    className="mt-2 w-full text-center text-xs text-navy-400 underline-offset-2 hover:underline dark:text-navy-500"
                  >
                    Go back
                  </button>
                </div>
              ) : (
                <>
                  {error && (
                    <p className="mb-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
                  )}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void startCheckout()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-sm font-bold text-navy-950 shadow-lg transition hover:bg-amber-300 disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="animate-pulse">Opening checkout…</span>
                    ) : (
                      <>
                        <Crown className="h-4 w-4" strokeWidth={2.5} />
                        Get PRO — ${priceUsd}/mo
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-navy-400 dark:text-navy-500">
                    Cancel anytime · Secure payment via Paddle
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
