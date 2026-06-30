import Link from "next/link";
import { BarChart3, Settings } from "lucide-react";

const cards = [
  {
    href: "/ops/banterbird-stats",
    title: "Analytics",
    description: "DAU, retention, match timing, skip rates, and AI fallback metrics.",
    icon: BarChart3,
  },
  {
    href: "/ops/settings",
    title: "Bot settings",
    description: "Tune AI practice bot timing, personality, sexual vibe, and session policy. Changes apply live.",
    icon: Settings,
  },
] as const;

export default function OpsDashboardPage() {
  return (
    <div className="min-h-screen bg-[#0c121c] px-4 py-10 text-navy-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">Ops</h1>
        <p className="mt-2 text-sm text-navy-300">
          Internal tools for BanterBird. Not linked from the main app.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {cards.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-white/10 bg-navy-900/40 p-6 transition hover:border-violet-500/40 hover:bg-navy-900/60"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-violet-600/20 p-3 text-violet-300 group-hover:bg-violet-600/30">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-navy-300">{description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-xs text-navy-500">
          <Link href="/" className="text-navy-400 underline-offset-2 hover:text-navy-200 hover:underline">
            Back to app
          </Link>
        </p>
      </div>
    </div>
  );
}
