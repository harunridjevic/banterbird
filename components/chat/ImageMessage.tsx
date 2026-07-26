"use client";

import { useState } from "react";
import { Eye, X, ZoomIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Renders a single image message.
 * - mine=true  → always visible, click → lightbox
 * - mine=false → blurred with a "tap to reveal" overlay, then click → lightbox
 */
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

  return (
    <>
      <div
        className="relative cursor-pointer overflow-hidden rounded-2xl"
        style={{ maxWidth: 260 }}
        onClick={() => {
          if (!revealed) {
            setRevealed(true);
          } else {
            setLightbox(true);
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={mine ? "Image you sent" : `Image from ${peerLabel ?? "Stranger"}`}
          className={`block w-full rounded-2xl object-cover transition duration-300 ${
            revealed ? "blur-0" : "blur-xl brightness-75"
          }`}
          style={{ maxHeight: 320 }}
          loading="lazy"
        />

        {/* Reveal overlay */}
        {!revealed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30">
            <Eye className="h-7 w-7 text-white drop-shadow" />
            <span className="text-xs font-semibold text-white drop-shadow">
              Tap to see image
            </span>
          </div>
        )}

        {/* Zoom hint once revealed */}
        {revealed && (
          <div className="absolute bottom-1.5 right-1.5 rounded-lg bg-black/40 p-1">
            <ZoomIn className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightbox(false)}
          >
            <button
              type="button"
              onClick={() => setLightbox(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <motion.img
              src={url}
              alt="Full size"
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
