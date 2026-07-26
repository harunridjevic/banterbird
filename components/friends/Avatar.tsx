/** Tiny reusable avatar with initial fallback */
export function Avatar({
  url,
  username,
  size = "md",
}: {
  url: string | null;
  username: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "h-7 w-7 text-xs" : size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-sm";
  const initial = (username ?? "?")[0]?.toUpperCase();

  return (
    <span
      className={`${dim} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-navy-200/60 bg-navy-100 font-bold text-navy-600 dark:border-white/10 dark:bg-navy-800 dark:text-navy-300`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
