"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MessageCircle, Shield, Zap } from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Truly anonymous",
    body: "No profiles or sign-up forms. A lightweight anonymous session is all you need.",
  },
  {
    icon: Zap,
    title: "Realtime",
    body: "Messages, typing, and presence are powered by Supabase channels for snappy delivery.",
  },
  {
    icon: MessageCircle,
    title: "Random matching",
    body: "Drop into the queue and get paired with another friendly stranger in seconds.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(30,58,95,0.12),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(148,163,184,0.08),_transparent_50%)]" />
        <main className="relative mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
          <section className="flex flex-col items-center gap-10 text-center lg:flex-row lg:items-start lg:gap-16 lg:text-left">
            <div className="max-w-xl flex-1 space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full border border-navy-200/80 bg-white/60 px-4 py-1.5 text-xs font-medium text-navy-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-navy-900/40 dark:text-navy-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live anonymous chat
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.05 }}
                className="text-4xl font-semibold tracking-tight text-navy-950 sm:text-5xl dark:text-navy-50"
              >
                Chat freely.
                <span className="mt-2 block text-navy-600 dark:text-navy-300">No baggage. Just banter.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.12 }}
                className="text-lg leading-relaxed text-navy-600 dark:text-navy-300"
              >
                BanterBird pairs you randomly with another person for a minimal, glassy chat experience
                tuned for speed on every device.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.18 }}
                className="flex flex-col items-center gap-3 sm:flex-row lg:justify-start"
              >
                <Link
                  href="/match"
                  className="group inline-flex items-center justify-center gap-2 rounded-3xl bg-navy-900 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-navy-900/20 transition hover:bg-navy-800 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
                >
                  Start chatting
                  <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
                </Link>
                <p className="text-xs text-navy-500 dark:text-navy-400">No accounts. Respectful vibes only.</p>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.1 }}
              className="glass-panel relative w-full max-w-md rounded-[2rem] p-8 text-left"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-navy-400">
                Preview
              </p>
              <div className="mt-6 space-y-3">
                <div className="ml-auto max-w-[80%] rounded-3xl rounded-br-md bg-[var(--color-bubble-me)] px-4 py-2.5 text-sm text-white shadow-sm">
                  Hey — random human. How is your day going?
                </div>
                <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-[var(--color-bubble-them)] px-4 py-2.5 text-sm text-navy-950 shadow-sm dark:text-navy-50">
                  Pretty good! Working on a tiny side project. You?
                </div>
                <div className="ml-auto max-w-[70%] rounded-3xl rounded-br-md bg-[var(--color-bubble-me)] px-4 py-2.5 text-sm text-white shadow-sm">
                  Same here. BanterBird is oddly calming.
                </div>
              </div>
              <motion.div
                className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-navy-900/10 blur-2xl dark:bg-white/10"
                animate={{ opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
            </motion.div>
          </section>

          <section className="mt-24 grid gap-6 sm:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
                whileHover={{ y: -4 }}
                className="rounded-3xl border border-navy-200/60 bg-white/40 p-6 shadow-sm dark:border-white/10 dark:bg-navy-900/25"
              >
                <f.icon className="h-8 w-8 text-navy-800 dark:text-navy-100" strokeWidth={1.5} />
                <h2 className="mt-4 text-base font-semibold text-navy-950 dark:text-navy-50">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-navy-600 dark:text-navy-300">{f.body}</p>
              </motion.div>
            ))}
          </section>
        </main>
      </div>
  );
}
