import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ops",
  robots: { index: false, follow: false },
};

export default function OpsLayout({ children }: { children: ReactNode }) {
  return children;
}
