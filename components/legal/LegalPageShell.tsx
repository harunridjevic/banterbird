import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  updated: string;
  children: ReactNode;
};

export function LegalPageShell({ title, updated, children }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/match"
        className="inline-flex items-center text-sm font-medium text-navy-600 underline-offset-2 hover:text-navy-900 hover:underline dark:text-navy-400 dark:hover:text-navy-100"
      >
        ← Back to match
      </Link>

      <header className="mt-6 border-b border-navy-200/60 pb-6 dark:border-white/10">
        <h1 className="text-2xl font-bold tracking-tight text-navy-950 sm:text-3xl dark:text-navy-50">
          {title}
        </h1>
        <p className="mt-2 text-sm text-navy-500 dark:text-navy-400">Last updated: {updated}</p>
      </header>

      <article className="mt-8 space-y-5 text-[15px] leading-7 text-navy-800 dark:text-navy-200 [&_h2]:mt-10 [&_h2]:border-b [&_h2]:border-navy-200/50 [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-navy-950 dark:[&_h2]:border-white/10 dark:[&_h2]:text-navy-50 [&_p]:text-pretty [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
