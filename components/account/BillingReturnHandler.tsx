"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@/lib/account/context";

/**
 * After NOWPayments redirects back with ?billing=success|cancel,
 * refresh PRO status and open the account modal on success.
 */
export function BillingReturnHandler() {
  const { refresh, openModal } = useAccount();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (billing !== "success" && billing !== "cancel") return;

    handled.current = true;
    params.delete("billing");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);

    if (billing === "success") {
      // IPN may arrive slightly after redirect — poll a few times
      void (async () => {
        for (let i = 0; i < 5; i++) {
          await refresh();
          await new Promise((r) => setTimeout(r, 1500));
        }
        openModal();
      })();
    }
  }, [refresh, openModal]);

  return null;
}
