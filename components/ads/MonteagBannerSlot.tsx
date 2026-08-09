"use client";

import { useEffect, useRef } from "react";

/**
 * Monetag banner ad — injects the Monetag tag script once per mount.
 * Zone: 11540658 (nap5k.com)
 */
export function MonteagBannerSlot() {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    const script = document.createElement("script");
    script.dataset["zone"] = "11540658";
    script.src = "https://nap5k.com/tag.min.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Leave the script in the DOM — removing it does not un-render the ad
      // and re-injecting on remount would duplicate it.
    };
  }, []);

  // The Monetag script renders its own container — we just need a mount point.
  return null;
}
