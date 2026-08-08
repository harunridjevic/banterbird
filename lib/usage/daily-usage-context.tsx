"use client";

/**
 * DailyUsageContext
 *
 * Provides client-side access to today's usage counts so badges and
 * upgrade gates in ChatRoom, ChatComposer, and MatchLobby stay in sync.
 *
 * Fetched once on mount and refreshed whenever `refresh()` is called
 * (e.g. after successfully sending an image or consuming a gender skip).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getDeviceId } from "@/lib/moderation/device-id";

export const FREE_IMAGE_LIMIT = 1;
export const FREE_GENDER_SKIP_LIMIT = 10;

export type DailyUsageState = {
  /** Has the initial fetch completed? */
  loaded: boolean;
  isPro: boolean;
  imagesSent: number;
  genderSkips: number;
  /** null = unlimited (PRO) */
  imageDailyLimit: number | null;
  /** null = unlimited (PRO) */
  genderSkipDailyLimit: number | null;
  /** null = unlimited (PRO) */
  imagesRemaining: number | null;
  /** null = unlimited (PRO) */
  genderSkipsRemaining: number | null;
};

type DailyUsageCtx = DailyUsageState & {
  /** Re-fetch counts from the server */
  refresh: () => Promise<void>;
  /** Optimistically decrement imagesSent remaining by 1 */
  consumeImage: () => void;
  /** Optimistically decrement genderSkips remaining by 1 */
  consumeGenderSkip: () => void;
};

const DEFAULT: DailyUsageState = {
  loaded: false,
  isPro: false,
  imagesSent: 0,
  genderSkips: 0,
  imageDailyLimit: FREE_IMAGE_LIMIT,
  genderSkipDailyLimit: FREE_GENDER_SKIP_LIMIT,
  imagesRemaining: FREE_IMAGE_LIMIT,
  genderSkipsRemaining: FREE_GENDER_SKIP_LIMIT,
};

const DailyUsageContext = createContext<DailyUsageCtx | null>(null);

export function DailyUsageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DailyUsageState>(DEFAULT);

  const refresh = useCallback(async () => {
    try {
      const deviceId = getDeviceId();
      const res = await fetch(`/api/usage/daily?deviceId=${encodeURIComponent(deviceId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as Partial<DailyUsageState>;
      setState({
        loaded: true,
        isPro: Boolean(data.isPro),
        imagesSent: data.imagesSent ?? 0,
        genderSkips: data.genderSkips ?? 0,
        imageDailyLimit: data.imageDailyLimit ?? null,
        genderSkipDailyLimit: data.genderSkipDailyLimit ?? null,
        imagesRemaining: data.imagesRemaining ?? null,
        genderSkipsRemaining: data.genderSkipsRemaining ?? null,
      });
    } catch {
      // non-fatal — keep defaults
      setState((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const consumeImage = useCallback(() => {
    setState((prev) => {
      if (prev.isPro) return prev;
      const newSent = prev.imagesSent + 1;
      const lim = prev.imageDailyLimit ?? FREE_IMAGE_LIMIT;
      return {
        ...prev,
        imagesSent: newSent,
        imagesRemaining: Math.max(0, lim - newSent),
      };
    });
  }, []);

  const consumeGenderSkip = useCallback(() => {
    setState((prev) => {
      if (prev.isPro) return prev;
      const newUsed = prev.genderSkips + 1;
      const lim = prev.genderSkipDailyLimit ?? FREE_GENDER_SKIP_LIMIT;
      return {
        ...prev,
        genderSkips: newUsed,
        genderSkipsRemaining: Math.max(0, lim - newUsed),
      };
    });
  }, []);

  return (
    <DailyUsageContext.Provider value={{ ...state, refresh, consumeImage, consumeGenderSkip }}>
      {children}
    </DailyUsageContext.Provider>
  );
}

export function useDailyUsage(): DailyUsageCtx {
  const ctx = useContext(DailyUsageContext);
  if (!ctx) throw new Error("useDailyUsage must be used within DailyUsageProvider");
  return ctx;
}
