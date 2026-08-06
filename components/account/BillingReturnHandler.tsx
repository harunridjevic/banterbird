"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@/lib/account/context";

/**
 * Two jobs:
 * 1. Listens for Paddle's checkout.completed JS event globally so PRO
 *    activates even if the account modal (and ProSubscribePanel) is closed.
 * 2. Handles the ?_ptxn return URL param Paddle appends on redirect-mode
 *    checkouts (safety net — overlay mode doesn't redirect but just in case).
 */
export function BillingReturnHandler() {
  const { refresh, openModal } = useAccount();
  const handled = useRef(false);
  const pollRunning = useRef(false);

  // Poll billing status and open modal once PRO is confirmed
  const pollUntilPro = () => {
    if (pollRunning.current) return;
    pollRunning.current = true;
    void (async () => {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        await refresh();
      }
      openModal();
      pollRunning.current = false;
    })();
  };

  // Global Paddle checkout.completed listener
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Paddle.js fires events on window via its own mechanism.
    // We poll until it's initialised, then attach.
    let attempts = 0;
    const tryAttach = setInterval(() => {
      attempts++;
      if (window.Paddle || attempts > 30) {
        clearInterval(tryAttach);
      }
      if (window.Paddle) {
        // Re-initialize with the event callback to catch checkout.completed
        // regardless of which component opened the checkout.
        const original = window.Paddle.Initialize.bind(window.Paddle);
        window.Paddle.Initialize = (opts) => {
          original({
            ...opts,
            eventCallback: (event: { name: string; data?: unknown }) => {
              opts.eventCallback?.(event);
              if (event.name === "checkout.completed") {
                pollUntilPro();
              }
            },
          });
        };
      }
    }, 500);

    return () => clearInterval(tryAttach);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ?_ptxn URL param (Paddle redirect-mode safety net)
  useEffect(() => {
    if (handled.current) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hasPaddleReturn = params.has("_ptxn");
    const legacyBilling = params.get("billing");

    if (!hasPaddleReturn && legacyBilling !== "success") return;

    handled.current = true;
    params.delete("_ptxn");
    params.delete("billing");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);

    pollUntilPro();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
