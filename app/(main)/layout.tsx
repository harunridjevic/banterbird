import { Navbar } from "@/components/layout/Navbar";
import { SiteFooterWrapper } from "@/components/layout/SiteFooterWrapper";
import { AdBannerGate } from "@/components/ads/AdBannerGate";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      <div data-ad-banner>
        <AdBannerGate />
      </div>
      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      <SiteFooterWrapper />
    </div>
  );
}
