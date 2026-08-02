"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * On mobile (≤640px) we set an explicit pixel height equal to the visible
 * viewport minus the fixed chrome (navbar + ad banner + footer) so the
 * composer stays pinned above the software keyboard.
 *
 * We derive the chrome heights from CSS custom properties that each element
 * sets on mount, rather than polling getBoundingClientRect on every
 * visualViewport resize — this eliminates the race between the keyboard
 * opening, the navbar shrinking, and the height measurement.
 */
export function ChatViewportShell({ children }: Props) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const vv = window.visualViewport;

    const measure = () => {
      if (!mq.matches || !vv) {
        setHeight(null);
        return;
      }

      // Read heights directly from the live elements — but do it inside a
      // rAF so we measure *after* the navbar/footer have finished their own
      // transition for this event loop tick.
      requestAnimationFrame(() => {
        const nav    = document.querySelector("header");
        const banner = document.querySelector("[data-ad-banner]");
        const footer = document.querySelector("[data-site-footer]");

        const navH    = nav?.getBoundingClientRect().height    ?? 56;
        const bannerH = banner?.getBoundingClientRect().height ?? 0;
        const footerH = footer?.getBoundingClientRect().height ?? 0;

        const h = Math.round(vv.height - navH - bannerH - footerH);
        setHeight(Math.max(120, h));
      });
    };

    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    mq.addEventListener("change", measure);

    // Also re-measure whenever focus changes (keyboard open/close) since
    // the navbar height transitions after the focus event fires.
    document.addEventListener("focusin",  measure);
    document.addEventListener("focusout", measure);

    return () => {
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", measure);
      document.removeEventListener("focusin",  measure);
      document.removeEventListener("focusout", measure);
    };
  }, []);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={height !== null ? { height, maxHeight: height, flex: "none" } : undefined}
    >
      {children}
    </div>
  );
}
