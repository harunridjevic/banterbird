"use client";

import { SiteFooter } from "./SiteFooter";
import { useKeyboardOpen } from "@/lib/hooks/use-keyboard-open";

export function SiteFooterWrapper() {
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) return null;
  return <SiteFooter />;
}
