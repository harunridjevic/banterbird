import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ExoClickBannerSlot } from "@/components/ads/ExoClickBannerSlot";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      {/* Renders the right banner size for the screen, disappears if no ad fills */}
      <ExoClickBannerSlot />
      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      <SiteFooter />
    </div>
  );
}
