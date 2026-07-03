"use client";

import type { ReactNode } from "react";
import { AgeGateModal, useAgeGate } from "@/components/legal/AgeGateModal";
import { PageLoader } from "@/components/ui/Loading";

export function AgeGateWrapper({ children }: { children: ReactNode }) {
  const { required, minimumAge, checked, confirm } = useAgeGate();

  if (!checked) {
    return <PageLoader label="Loading…" />;
  }

  return (
    <>
      {required ? <AgeGateModal minimumAge={minimumAge} onConfirm={confirm} /> : null}
      {children}
    </>
  );
}
