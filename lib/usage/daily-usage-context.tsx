"use client";

/**
 * DailyUsageContext
 *
 * Provides client-side access to today's usage counts so badges and
 * upgrade gates in ChatRoom, ChatComposer, and MatchLobby stay in sync.
 *
 * Refresh strategy:
 *   - On mount.
 *   - Whenever Supabase auth state changes (login / logout / token refresh),
 *     so badges appear immediately after sign-out or sign-in.
 *   - After consumeImage / consumeGenderSkip: optimistic decrement first,
 *     then server re-fetch to confirm the true count.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getDeviceId } from "@/lib/moderation/device-id";
import { createClient } from "@/utils/supabase/client";

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
  /**
   * Call after successfully sending an image.
   * Optimistically decrements the badge, then re-fetches from the server.
   */
  consumeImage: () => void;
  /**
   * Call after starting a gender-filtered match.
   * Optimistically decrements the badge, then re-fetches from the server.
   */
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
  // Debounce re-fetch after optimistic updates so we don't hammer the API
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // non-fatal — keep whatever state we had
      setState((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  // Schedule a server re-fetch after a short delay (lets the server-side
  // increment finish before we read the new count back).
  const scheduleRefresh = useCallback(
    (delayMs = 800) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refresh();
      }, delayMs);
    },
    [refresh],
  );

  // ── Initial fetch + auth-state listener ────────────────────────────────────
  useEffect(() => {
    void refresh();

    const supabase = createClient();
    // Re-fetch whenever the user logs in, logs out, or their token refreshes —
    // this is what makes badges show up immediately after logout.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      subscription.unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  // ── Optimistic updates with server confirmation ─────────────────────────────
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
    // Confirm with server after the increment has had time to land
    scheduleRefresh(1200);
  }, [scheduleRefresh]);

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
    scheduleRefresh(1200);
  }, [scheduleRefresh]);

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
