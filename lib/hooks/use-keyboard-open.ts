"use client";

import { useEffect, useState } from "react";

/** Returns true when a text input is focused — i.e. the mobile keyboard is up. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

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

  return open;
}
