import { Navbar } from "@/components/layout/Navbar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
