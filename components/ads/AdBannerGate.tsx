"use client";

import { useAccount } from "@/lib/account/context";
import { ExoClickBannerSlot } from "@/components/ads/ExoClickBannerSlot";

/** Site banner ads — hidden for active PRO subscribers. */
export function AdBannerGate() {
  const { isPro } = useAccount();
  if (isPro) return null;
  return <ExoClickBannerSlot />;
}
