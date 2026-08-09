import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ops",
  robots: { index: false, follow: false },
};

/** Own scroll container — document overflow is locked to stop ad scrollbar flash. */
export default function OpsLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh overflow-y-auto">{children}</div>;
}
