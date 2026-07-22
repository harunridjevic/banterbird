import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      <SiteFooter />
    </div>
  );
}
