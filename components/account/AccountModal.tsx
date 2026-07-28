"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useSupabase } from "@/app/providers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAccount } from "@/lib/account/context";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";
import { ProfileEditor } from "./ProfileEditor";

type Tab = "signin" | "signup";

export function AccountModal() {
  const { modalOpen, closeModal, state } = useAccount();
  const { client } = useSupabase();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("signin");

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modalOpen, closeModal]);

  // Only lock scroll on desktop — on mobile the panel sits in its own zone
  // and the navbar/footer remain fully interactive.
  useEffect(() => {
    if (modalOpen) {
      // Only lock on sm+ (≥640px)
      if (window.innerWidth >= 640) {
        document.body.style.overflow = "hidden";
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [modalOpen]);

  const isNamed = state.status === "named";

  return (
    <AnimatePresence>
      {modalOpen && (
        <>
          {/*
            MOBILE layout:
            - No full-screen overlay — navbar and footer stay clickable
            - Panel fills the area between navbar (h-14=56px) and footer (~h-9=36px)
            - No backdrop dimming over navbar/footer
            - z-[100] so it's above page content but navbar (z-50) stays on top
          */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className={[
              // Mobile: fixed panel between navbar and footer, no overlay
              "fixed left-0 right-0 z-[100] flex flex-col",
              "top-14",
              "h-[calc(100dvh-56px-36px)]",
              // Use glass-panel for blur effect — solid enough to read, blurs content behind
              "glass-panel shadow-2xl",
              "border-t border-b border-navy-200/60 dark:border-white/10",
              // Desktop: hidden — use the centered modal below instead
              "sm:hidden",
            ].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-label={isNamed ? "Account settings" : "Sign in or create account"}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-navy-200/60 px-5 py-3.5 dark:border-white/10">
              <span className="text-sm font-bold text-navy-950 dark:text-navy-50">
                {isNamed ? "Account" : tab === "signin" ? "Sign in" : "Create account"}
              </span>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-navy-200/70 bg-white/70 text-navy-700 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            {isNamed ? (
              <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
                <ProfileEditor profile={state.profile} supabase={client} onClose={closeModal} />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <MobileSignInContent tab={tab} setTab={setTab} client={client} closeModal={closeModal} />
              </div>
            )}
          </motion.div>

          {/*
            DESKTOP layout (sm+):
            - Full-screen overlay with backdrop
            - Centred card
          */}
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[200] hidden items-center justify-center sm:flex"
            onClick={(e) => { if (e.target === overlayRef.current) closeModal(); }}
          >
            <div className="absolute inset-0 bg-navy-950/50 dark:bg-navy-950/70" />

            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="glass-panel relative z-10 flex w-full max-w-md flex-col rounded-3xl border border-navy-200/70 shadow-2xl dark:border-white/10 sm:max-h-[90dvh]"
              role="dialog"
              aria-modal="true"
              aria-label={isNamed ? "Account settings" : "Sign in or create account"}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-navy-200/60 px-5 py-3.5 dark:border-white/10">
                <span className="text-sm font-bold text-navy-950 dark:text-navy-50">
                  {isNamed ? "Account" : tab === "signin" ? "Sign in" : "Create account"}
                </span>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-navy-200/70 bg-white/70 text-navy-700 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-300 dark:hover:bg-navy-800"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              {isNamed ? (
                <div className="min-h-0 flex-1 overflow-hidden px-5 py-5 sm:px-6">
                  <ProfileEditor profile={state.profile} supabase={client} onClose={closeModal} />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                  <MobileSignInContent tab={tab} setTab={setTab} client={client} closeModal={closeModal} />
                </div>
              )}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Shared sign-in/sign-up content used in both mobile and desktop panels
function MobileSignInContent({
  tab,
  setTab,
  client,
  closeModal,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  client: SupabaseClient;
  closeModal: () => void;
}) {
  return (
    <>
      <p className="mb-5 text-sm text-navy-600 dark:text-navy-400">
        {tab === "signin"
          ? "Sign in to access friends, DMs and your profile."
          : "Join BanterBird to save your profile and connect with friends."}
      </p>

      <div className="mb-5 flex rounded-2xl border border-navy-200/70 bg-navy-100/50 p-1 dark:border-white/10 dark:bg-navy-900/40">
        {(["signin", "signup"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              tab === t
                ? "bg-white text-navy-950 shadow-sm dark:bg-navy-800 dark:text-navy-50"
                : "text-navy-600 hover:text-navy-900 dark:text-navy-400 dark:hover:text-navy-200"
            }`}
          >
            {t === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === "signin" ? (
          <motion.div key="signin" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }}>
            <SignInForm supabase={client} onSuccess={closeModal} />
          </motion.div>
        ) : (
          <motion.div key="signup" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
            <SignUpForm supabase={client} onSuccess={closeModal} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
