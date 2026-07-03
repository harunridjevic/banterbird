import { SessionCleanupOnMount } from "@/components/session/SessionCleanupOnMount";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SessionCleanupOnMount />
      {children}
    </div>
  );
}
