"use client";

import { useState } from "react";
import { Eye, X, ZoomIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
          alt={mine ? "Image you sent" : `Image from ${peerLabel ?? "Stranger"}`}
          className={`block w-full rounded-2xl object-cover transition duration-300 ${
            revealed ? "blur-0" : "blur-xl brightness-75"
          }`}
          style={{ maxHeight: 300 }}
          loading="lazy"
        />

        {!revealed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30">
            <Eye className="h-7 w-7 text-white drop-shadow" />
            <span className="text-xs font-semibold text-white drop-shadow">Tap to see image</span>
          </div>
        )}

        {revealed && (
          <div className="absolute bottom-1.5 right-1.5 rounded-lg bg-black/40 p-1">
            <ZoomIn className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            // Scrollable container: overflow-y-auto lets tall images scroll.
            // grid + place-items-center keeps short images centred.
            className="fixed inset-0 z-[300] grid place-items-start overflow-y-auto bg-black/95"
            onClick={() => setLightbox(false)}
          >
            {/* Close button — sticky so it's always reachable */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
              className="sticky top-4 left-full z-10 mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Image — centred in the grid cell, padded so it doesn't touch edges */}
            <div
              className="flex min-h-screen w-full items-center justify-center p-4 pt-14"
              onClick={() => setLightbox(false)}
            >
              <motion.img
                src={url}
                alt="Full size"
                initial={{ scale: 0.93, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.93, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="max-w-full rounded-2xl object-contain shadow-2xl"
                style={{ maxHeight: "calc(100dvh - 80px)" }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
