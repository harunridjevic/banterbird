"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * Sizes the chat column to the visible viewport so the composer stays pinned
 * to the bottom above the mobile keyboard at all times.
 *
 * Also accounts for the ExoClick banner slot (data-ad-banner) which sits
 * between the navbar and main — without this the banner steals height from
 * the flex layout and the composer gets pushed off-screen on mobile.
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
      const nav    = document.querySelector("header");
      const banner = document.querySelector("[data-ad-banner]");
      const footer = document.querySelector("[data-site-footer]");

      const navH    = nav?.getBoundingClientRect().height    ?? 56;
      const bannerH = banner?.getBoundingClientRect().height ?? 0;
      const footerH = footer?.getBoundingClientRect().height ?? 0;

      const h = Math.round(vv.height - navH - bannerH - footerH);
      setHeight(Math.max(120, h));
    };

    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    mq.addEventListener("change", measure);

    return () => {
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", measure);
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
