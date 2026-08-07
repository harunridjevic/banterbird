"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@/lib/account/context";

/**
 * Three jobs:
 * 1. Listens for Paddle's checkout.completed JS event globally so PRO
 *    activates even if the account modal is closed.
 * 2. Listens for Paddle overlay close (checkout.closed) to trigger a
 *    refresh in case the webhook already fired while checkout was open.
 * 3. Handles ?_ptxn return URL param as a safety net.
 */
export function BillingReturnHandler() {
  const { refresh, openModal } = useAccount();
  const pollRunning = useRef(false);
  const handled = useRef(false);

  const pollUntilPro = (openModalAfter = true) => {
    if (pollRunning.current) return;
    pollRunning.current = true;
    void (async () => {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        await refresh();
      }
      if (openModalAfter) openModal();
      pollRunning.current = false;
    })();
  };

  // Attach Paddle event listeners once Paddle.js is loaded
  useEffect(() => {
    if (typeof window === "undefined") return;

    let attempts = 0;
    const tryAttach = setInterval(() => {
      attempts++;
      if (attempts > 60) { clearInterval(tryAttach); return; }
      if (!window.Paddle) return;

      clearInterval(tryAttach);

      // Wrap Initialize to inject our global eventCallback
      const original = window.Paddle.Initialize.bind(window.Paddle);
      window.Paddle.Initialize = (opts) => {
        original({
          ...opts,
          eventCallback: (event: { name: string; data?: unknown }) => {
            // Call the component's own callback first
            opts.eventCallback?.(event);

            if (event.name === "checkout.completed") {
              // Payment confirmed — poll until webhook activates PRO
              pollUntilPro(true);
            }

            if (event.name === "checkout.closed") {
              // Overlay closed — do a single quiet refresh in case
              // the webhook already fired while checkout was open
              void refresh();
            }
          },
        });
      };
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

    pollUntilPro(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
