"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account/context";
import { ExoClickBannerSlot } from "@/components/ads/ExoClickBannerSlot";

/** Site banner ads — hidden for PRO subscribers, while auth is loading,
 *  and when disabled via ops settings. */
export function AdBannerGate() {
  const { isPro, state } = useAccount();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/public");
        if (!res.ok) return;
        const data = (await res.json()) as { ads?: { showBannerAds?: boolean } };
        setShowBanner(data.ads?.showBannerAds !== false);
      } catch { /* keep hidden on error */ }
    })();
  }, []);

  if (state.status === "loading") return null;
  if (isPro) return null;
  if (!showBanner) return null;
  return <ExoClickBannerSlot />;
}
