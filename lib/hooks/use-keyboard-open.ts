"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when a text input is focused AND the screen is mobile-width
 * (< 640px) — i.e. a software keyboard is likely open.
 *
 * On desktop and tablet the hook always returns false so navbar compacting
 * and footer hiding never trigger on larger screens.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const mqHandler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setOpen(false); // clear when switching to desktop
    };
    mq.addEventListener("change", mqHandler);
    return () => mq.removeEventListener("change", mqHandler);
  }, []);

  useEffect(() => {
    const isTextInput = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      if (tag === "TEXTAREA") return true;
      if (tag === "INPUT") {
        const type = (el as HTMLInputElement).type;
        return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(type);
      }
      return (el as HTMLElement).isContentEditable;
    };

    const onFocusIn  = (e: FocusEvent) => { if (isTextInput(e.target as Element)) setOpen(true); };
    const onFocusOut = (e: FocusEvent) => { if (isTextInput(e.target as Element)) setOpen(false); };

    document.addEventListener("focusin",  onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin",  onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Only report keyboard open on mobile — desktop/tablet never compact
  return isMobile && open;
}
