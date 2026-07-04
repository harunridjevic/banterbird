import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms", title: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy", title: "Privacy Policy" },
  { href: "/legal/community", label: "Guidelines", title: "Community Guidelines" },
  { href: "/legal/cookies", label: "Cookies", title: "Cookie Policy" },
] as const;

export function SiteFooter() {
  return (
    <footer
      data-site-footer
      className="shrink-0 border-t border-navy-200/50 bg-[var(--glass-bg)] px-2 py-2 dark:border-white/10 sm:px-4 sm:py-3"
    >
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <nav className="flex flex-nowrap items-center gap-2 sm:gap-4">
          {LEGAL_LINKS.map(({ href, label, title }) => (
            <Link
              key={href}
              href={href}
              title={title}
              className="shrink-0 whitespace-nowrap text-[10px] text-navy-500 underline-offset-2 hover:text-navy-800 hover:underline sm:text-xs dark:text-navy-400 dark:hover:text-navy-200"
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="shrink-0 whitespace-nowrap text-[10px] text-navy-400 sm:text-xs dark:text-navy-500">
          v0.7.0
        </p>
      </div>
    </footer>
  );
}
