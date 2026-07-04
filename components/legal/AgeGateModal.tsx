"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type Props = {
  minimumAge: number;
  onConfirm: () => void;
};

export function AgeGateModal({ minimumAge, onConfirm }: Props) {
  const [declined, setDeclined] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-navy-200/60 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-navy-900"
      >
        <h2 className="text-xl font-bold text-navy-950 dark:text-navy-50">Age confirmation</h2>
        <p className="mt-3 text-sm leading-relaxed text-navy-700 dark:text-navy-300">
          BanterBird is for adults. By continuing, you confirm you are at least{" "}
          <strong>{minimumAge}</strong> years old and agree to our{" "}
          <a href="/legal/terms" className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400">
            Terms of Service
          </a>
          .
        </p>
        {declined ? (
          <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">
            You must be {minimumAge}+ to use BanterBird.
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setDeclined(true)}
            className="rounded-2xl border border-navy-200/80 px-5 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50 dark:border-white/10 dark:text-navy-200 dark:hover:bg-white/5"
          >
            I am under {minimumAge}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-navy-100 dark:text-navy-950"
          >
            I am {minimumAge} or older
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const AGE_CONFIRMED_KEY = "banterbird:ageConfirmed";

export function useAgeGate() {
  const [required, setRequired] = useState(false);
  const [minimumAge, setMinimumAge] = useState(18);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        if (localStorage.getItem(AGE_CONFIRMED_KEY) === "1") {
          setChecked(true);
          return;
        }
        const res = await fetch("/api/settings/public");
        if (!res.ok) {
          setChecked(true);
          return;
        }
        const data = (await res.json()) as { ageGate?: { enabled?: boolean; minimumAge?: number } };
        if (data.ageGate?.enabled) {
          setMinimumAge(data.ageGate.minimumAge ?? 18);
          setRequired(true);
        }
      } catch {
        // fail open if settings unavailable
      } finally {
        setChecked(true);
      }
    })();
  }, []);

  const confirm = () => {
    localStorage.setItem(AGE_CONFIRMED_KEY, "1");
    setRequired(false);
  };

  return { required, minimumAge, checked, confirm };
}
