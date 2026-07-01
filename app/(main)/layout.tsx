import { Navbar } from "@/components/layout/Navbar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <Navbar />
      <main className="relative">{children}</main>
    </div>
  );
}
