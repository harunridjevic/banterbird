import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ExoClickBanner } from "@/components/ads/ExoClickBanner";

// ── Ad Zone IDs & classes (from ExoClick generated snippets) ──────────────
const DESKTOP = { zoneId: "5991070",  insClass: "eas6a97888e2",  width: 728, height: 90 };
const MOBILE  = { zoneId: "5991072",  insClass: "eas6a97888e10", width: 320, height: 50 };
// ─────────────────────────────────────────────────────────────────────────

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />

      {/* Desktop banner 728×90 — hidden on mobile */}
      <div className="hidden sm:flex w-full shrink-0 items-center justify-center bg-[var(--glass-bg)] py-1">
        <ExoClickBanner {...DESKTOP} />
      </div>

      {/* Mobile banner 320×50 — hidden on desktop */}
      <div className="flex sm:hidden w-full shrink-0 items-center justify-center bg-[var(--glass-bg)] py-1">
        <ExoClickBanner {...MOBILE} />
      </div>

      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      <SiteFooter />
    </div>
  );
}
