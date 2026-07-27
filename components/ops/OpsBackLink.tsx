import Link from "next/link";

/** Shared ops subpage back link - keep at the top of every ops panel. */
export function OpsBackLink() {
  return (
    <p className="text-xs text-navy-500">
      <Link href="/ops" className="underline-offset-2 hover:text-navy-200 hover:underline">
        ← Ops
      </Link>
    </p>
  );
}
