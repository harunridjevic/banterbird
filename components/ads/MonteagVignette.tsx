"use client";

import { useEffect, useRef } from "react";

/**
 * Monetag Vignette ad — zone 11540671 (n6wxm.com/vignette.min.js).
 *
 * Renders nothing visible itself. When mounted it injects the Monetag
 * vignette script once, which handles its own display/dismiss lifecycle.
 *
 * Mount this component only when a vignette should fire (i.e. after every
 * 3rd skip AND outside of an active chat). Unmounting it does not cancel
 * an already-displayed vignette but prevents further injections.
 *
 * Props:
 *   onDone — called after a short settle delay so the parent can proceed
 *            to matchmaking even if the vignette script never calls back.
 */
type Props = { onDone: () => void };

const VIGNETTE_ZONE = "11540671";
const VIGNETTE_SRC = "https://n6wxm.com/vignette.min.js";
/** Max ms we wait before unblocking matchmaking regardless of ad state. */
const MAX_BLOCK_MS = 3000;

export function MonteagVignette({ onDone }: Props) {
  const doneCalledRef = useRef(false);

  const callDone = (ref: React.MutableRefObject<boolean>, cb: () => void) => {
    if (ref.current) return;
    ref.current = true;
    cb();
  };

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    // Always unblock matchmaking after MAX_BLOCK_MS so a failed load never hangs the UX.
    timeout = setTimeout(() => {
      callDone(doneCalledRef, onDone);
    }, MAX_BLOCK_MS);

    // Inject the vignette script unless it has already been loaded this session.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${VIGNETTE_SRC}"]`,
    );

    if (!existing) {
      const script = document.createElement("script");
      script.dataset["zone"] = VIGNETTE_ZONE;
      script.src = VIGNETTE_SRC;
      script.async = true;
      // Fire onDone on load/error so we can proceed as early as possible.
      script.addEventListener("load", () => callDone(doneCalledRef, onDone), { once: true });
      script.addEventListener("error", () => callDone(doneCalledRef, onDone), { once: true });
      document.body.appendChild(script);
    } else {
      // Script already injected from a previous vignette — just wait for the
      // timeout above; the already-loaded script will handle display on its own.
    }

    return () => {
      if (timeout !== null) clearTimeout(timeout);
    };
    // onDone identity is expected to be stable (useCallback in parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
