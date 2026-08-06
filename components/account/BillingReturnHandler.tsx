"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@/lib/account/context";

/**
 * Handles post-checkout return URL params.
 *
 * Paddle overlay checkout fires a JS event (checkout.completed) which
 * ProSubscribePanel already listens to — but as a safety net, Paddle
 * may also append ?_ptxn=<txnId> to the success URL. We strip that here
 * and trigger a PRO status refresh so the UI reflects activation quickly.
 */
export function BillingReturnHandler() {
  const { refresh, openModal } = useAccount();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    // Paddle appends _ptxn on success redirect; legacy ?billing=success also handled
    const hasPaddleReturn = params.has("_ptxn");
    const legacyBilling = params.get("billing");

    if (!hasPaddleReturn && legacyBilling !== "success" && legacyBilling !== "cancel") {
      return;
    }

    handled.current = true;

    // Clean up URL params
    params.delete("_ptxn");
    params.delete("billing");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);

    if (hasPaddleReturn || legacyBilling === "success") {
      // Webhook may arrive slightly after redirect — poll a few times
      void (async () => {
        for (let i = 0; i < 6; i++) {
          await refresh();
          await new Promise((r) => setTimeout(r, 2000));
        }
        openModal();
      })();
    }
  }, [refresh, openModal]);

  return null;
}
