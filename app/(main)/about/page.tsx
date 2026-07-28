import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app";

export const metadata: Metadata = {
  title: "About BanterBird",
  description:
    "Learn about BanterBird - the free anonymous chat platform where you can instantly connect 1-on-1 with strangers worldwide. No signup, no accounts, no data kept.",
  alternates: { canonical: "/about" },
  openGraph: {
    url: `${baseUrl}/about`,
    title: "About BanterBird - Free Anonymous Chat",
    description:
      "BanterBird is a free anonymous chat app with instant 1-on-1 matching, no sign-up required. Learn how it works, who it's for, and why it's private.",
    siteName: "BanterBird",
    images: [{ url: "/logo_search.png", width: 1200, height: 630, alt: "BanterBird - About" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About BanterBird",
    description: "BanterBird is a free anonymous chat app with instant 1-on-1 matching, no sign-up required.",
    images: ["/logo_search.png"],
  },
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: `${baseUrl}/about`,
  name: "About BanterBird",
  description: "BanterBird is a free anonymous chat platform for instant 1-on-1 text conversations with strangers worldwide. No registration required.",
  isPartOf: { "@type": "WebSite", "@id": `${baseUrl}/#website` },
};

const FEATURES = [
  {
    icon: "⚡",
    title: "Instant matching",
    body: "You are paired with another person in seconds. No waiting rooms, no swipe queues. Just a live conversation.",
  },
  {
    icon: "🕵️",
    title: "Truly anonymous",
    body: "No name, email, or phone number required. Your identity stays yours. Every chat session is isolated.",
  },
  {
    icon: "🗑️",
    title: "No message history",
    body: "Chats are ephemeral by design. Once a session ends, the messages are gone. Nothing is stored on your device or our servers long-term.",
  },
  {
    icon: "🎯",
    title: "Gender-preference matching",
    body: "Tell us who you are and who you want to talk to. Our matching engine pairs you with people who share your preferences.",
  },
  {
    icon: "🌍",
    title: "Global community",
    body: "BanterBird connects people from every corner of the world. Hundreds of users are online at any given moment.",
  },
] as const;

const FAQS = [
  {
    q: "What is BanterBird?",
    a: "BanterBird is a free, anonymous 1-on-1 text chat platform. You open the site, pick your preferences, and within seconds you are connected with a real person somewhere in the world.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. BanterBird works without any account. You can optionally create one to save a username, set a profile picture, manage your preferences, and unlock social features like a friends list.",
  },
  {
    q: "Is BanterBird free?",
    a: "Yes, completely free. There is no premium tier, no ads in chat, and no paid features.",
  },
  {
    q: "How does the matching work?",
    a: "When you click start, BanterBird looks for another user whose gender preference matches yours. If a match is found, a private chat room is created for just the two of you.",
  },
  {
    q: "Are my chats private?",
    a: "Yes. Chat sessions are one-to-one. Nobody else can see your messages. Sessions end when either party leaves, and message content is not retained beyond the session.",
  },
  {
    q: "Can I be reported or blocked?",
    a: "Yes. Both users can report and block each other during a chat. Repeated violations result in access restrictions.",
  },
  {
    q: "Is BanterBird safe for minors?",
    a: "BanterBird is intended for users aged 18 and over. An age gate is shown before you can access the platform.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Hero */}
        <section className="mb-14 text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-navy-200/70 bg-white/70 shadow-xl dark:border-white/10 dark:bg-navy-900/50">
              <LogoMark className="h-12 w-12" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl dark:text-navy-50">
            About BanterBird
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-navy-700 dark:text-navy-300">
            BanterBird is a free anonymous chat platform. Open a chat, get matched with a real
            person in seconds, and have a genuine conversation. No sign-up, no profile, no trace.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-2xl bg-navy-900 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-navy-800 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
            >
              Start chatting
            </Link>
            <Link
              href="/legal/community"
              className="inline-flex items-center gap-2 rounded-2xl border border-navy-200/80 bg-white/70 px-6 py-3 text-sm font-semibold text-navy-900 transition hover:bg-white dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-100 dark:hover:bg-navy-800"
            >
              Community guidelines
            </Link>
          </div>
        </section>

        {/* What is BanterBird */}
        <section className="mb-14">
          <h2 className="mb-4 text-xl font-bold text-navy-950 dark:text-navy-50">What is BanterBird?</h2>
          <div className="glass-panel rounded-3xl border border-navy-200/70 p-6 dark:border-white/10">
            <p className="leading-relaxed text-navy-700 dark:text-navy-300">
              BanterBird is a real-time anonymous chat web app at{" "}
              <strong className="text-navy-900 dark:text-navy-100">banterbird.app</strong>. It
              connects two strangers in a private 1-on-1 text conversation — a modern, cleaner take
              on random chat, with smarter matching and a focus on genuine interaction.
            </p>
            <p className="mt-4 leading-relaxed text-navy-700 dark:text-navy-300">
              The platform is built for people who want to talk to someone new without the friction
              of creating yet another account, or the exposure of sharing a social profile. Whether
              you want to practise a language, get an outside perspective, vent to a stranger, or
              just have a good conversation — BanterBird is designed for that.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mb-14">
          <h2 className="mb-6 text-xl font-bold text-navy-950 dark:text-navy-50">How BanterBird works</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon, title, body }) => (
              <div key={title} className="glass-panel rounded-2xl border border-navy-200/60 p-5 dark:border-white/10">
                <div className="mb-3 text-2xl" aria-hidden>{icon}</div>
                <h3 className="mb-1.5 text-sm font-semibold text-navy-950 dark:text-navy-50">{title}</h3>
                <p className="text-sm leading-relaxed text-navy-600 dark:text-navy-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for */}
        <section className="mb-14">
          <h2 className="mb-4 text-xl font-bold text-navy-950 dark:text-navy-50">Who is BanterBird for?</h2>
          <div className="glass-panel rounded-3xl border border-navy-200/70 p-6 dark:border-white/10">
            <ul className="space-y-3 text-navy-700 dark:text-navy-300">
              {[
                "Language learners who want a real conversation partner without scheduling sessions",
                "People who want an outside perspective on a problem from a stranger",
                "Anyone curious about talking to someone from a different part of the world",
                "Introverts warming up their social skills in a low-stakes environment",
                "People who miss the serendipity of early-internet conversations",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed">
                  <span className="mt-0.5 shrink-0 text-xs text-navy-400 dark:text-navy-500" aria-hidden>▸</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Privacy */}
        <section className="mb-14">
          <h2 className="mb-4 text-xl font-bold text-navy-950 dark:text-navy-50">Privacy by design</h2>
          <div className="glass-panel rounded-3xl border border-navy-200/70 p-6 dark:border-white/10">
            <p className="leading-relaxed text-navy-700 dark:text-navy-300">
              Anonymity is not an afterthought on BanterBird — it is the foundation. No personal
              information is collected to start a chat. Sessions use temporary anonymous credentials
              that expire. Chat content is not retained once the session ends.
            </p>
            <p className="mt-4 leading-relaxed text-navy-700 dark:text-navy-300">
              If you choose to create an optional account, only what you provide is stored: a
              username, optionally a profile picture, and your match preferences. You can delete your
              account at any time.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="mb-6 text-xl font-bold text-navy-950 dark:text-navy-50">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="glass-panel rounded-2xl border border-navy-200/60 p-5 dark:border-white/10">
                <h3 className="mb-2 text-sm font-semibold text-navy-950 dark:text-navy-50">{q}</h3>
                <p className="text-sm leading-relaxed text-navy-600 dark:text-navy-400">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <h2 className="mb-3 text-xl font-bold text-navy-950 dark:text-navy-50">Ready to start a conversation?</h2>
          <p className="mb-6 text-sm text-navy-600 dark:text-navy-400">No account needed. Just click start and you are in.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl bg-navy-900 px-8 py-4 text-base font-semibold text-white shadow-lg transition hover:bg-navy-800 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
          >
            Start chatting free
          </Link>
        </section>
      </div>
    </>
  );
}
