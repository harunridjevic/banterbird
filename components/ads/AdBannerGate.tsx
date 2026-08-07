"use client";

import { useAccount } from "@/lib/account/context";
import { ExoClickBannerSlot } from "@/components/ads/ExoClickBannerSlot";

/** Site banner ads — hidden for active PRO subscribers and while auth is loading. */
export function AdBannerGate() {
  const { isPro, state } = useAccount();
  // Don't render until we know the auth state — prevents a flash of ads
  // for logged-in PRO users during the initial session load.
  if (state.status === "loading") return null;
  if (isPro) return null;
  return <ExoClickBannerSlot />;
}
