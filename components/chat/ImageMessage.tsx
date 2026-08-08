"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, X, ZoomIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/** Renders children into document.body via a portal */
function Lightbox({ onClose, url }: { onClose: () => void; url: string }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    // Prevent body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      // Full viewport, flex column, click outside to close
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-label="Image fullscreen"
    >
      {/* Top bar: close button */}
      <div className="flex shrink-0 items-center justify-end px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 active:scale-95"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Image area — fills remaining height, image constrained to fit without scrolling */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
        onClick={onClose}
      >
        <motion.img
          src={url}
          alt="Full size"
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>
    </motion.div>,
    document.body,
  );
}

export function ImageMessage({
  url,
  mine,
  peerLabel,
}: {
  url: string;
  mine: boolean;
  peerLabel?: string;
}) {
  const [revealed, setRevealed] = useState(mine);
  const [lightbox, setLightbox] = useState(false);
  // Only render portal after mount (document.body is unavailable on SSR)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      {/* ── Thumbnail ── */}
      <div
        className="relative cursor-pointer overflow-hidden rounded-2xl"
        style={{ maxWidth: 260 }}
        onClick={() => {
          if (!revealed) setRevealed(true);
          else setLightbox(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={mine ? "Image you sent" : `Image from ${peerLabel ?? "your match"}`}
          className={`block w-full rounded-2xl object-cover transition duration-300 ${
            revealed ? "blur-0" : "blur-xl brightness-75"
          }`}
          style={{ maxHeight: 300 }}
          loading="lazy"
        />

        {!revealed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30">
            <Eye className="h-7 w-7 text-white drop-shadow" />
            <span className="text-xs font-semibold text-white drop-shadow">
              Tap to reveal
            </span>
            <span className="text-[10px] text-white/70 drop-shadow">
              Blurred for your privacy
            </span>
          </div>
        )}

        {revealed && (
          <div className="absolute bottom-1.5 right-1.5 rounded-lg bg-black/40 p-1 pointer-events-none">
            <ZoomIn className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      {/* ── Lightbox via portal ── */}
      {mounted && (
        <AnimatePresence>
          {lightbox && (
            <Lightbox
              key="lightbox"
              url={url}
              onClose={() => setLightbox(false)}
            />
          )}
        </AnimatePresence>
      )}
    </>
  );
}
