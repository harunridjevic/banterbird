/**
 * Server-side daily usage helpers.
 *
 * All functions use the service-role Supabase client which bypasses RLS.
 * They call the security-definer SQL functions defined in the
 * 20260808120000_daily_usage_limits migration.
 *
 * Limits (for free / anonymous users):
 *   - Images: 1 per day per identity (IP + device_id)
 *   - Gender-based matches: 10 per day per identity
 *   - "Regardless" matches: unlimited
 *
 * Pro users bypass all limits.
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const FREE_DAILY_IMAGE_LIMIT = 1;
export const FREE_DAILY_GENDER_SKIP_LIMIT = 10;

export type UsageCounts = {
  imagesSent: number;
  genderSkips: number;
};

/** Fetch today's image-send and gender-skip counts for this identity. */
export async function getDailyUsage(
  ip: string | null,
  deviceId: string | null,
): Promise<UsageCounts> {
  try {
    const svc = createServiceRoleClient();
    const { data } = await svc.rpc("get_daily_usage_counts", {
      p_ip: ip ?? "",
      p_device_id: deviceId ?? "",
    });
    const d = data as { imagesSent?: number; genderSkips?: number } | null;
    return {
      imagesSent: d?.imagesSent ?? 0,
      genderSkips: d?.genderSkips ?? 0,
    };
  } catch {
    return { imagesSent: 0, genderSkips: 0 };
  }
}

/**
 * Check whether this identity can send an image today.
 * Pro users are always allowed.
 * Returns { allowed: true } or { allowed: false, reason }.
 */
export async function checkImageAllowed(
  ip: string | null,
  deviceId: string | null,
  isPro: boolean,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (isPro) return { allowed: true };

  try {
    const svc = createServiceRoleClient();
    const { data } = await svc.rpc("get_daily_image_count", {
      p_ip: ip ?? "",
      p_device_id: deviceId ?? "",
    });
    const count = (data as number) ?? 0;
    if (count >= FREE_DAILY_IMAGE_LIMIT) {
      return { allowed: false, reason: "daily_image_limit" };
    }
    return { allowed: true };
  } catch {
    // Fail open so a DB hiccup doesn't break messaging
    return { allowed: true };
  }
}

/**
 * Increment the image counter for this identity.
 * Returns the new count after incrementing.
 */
export async function recordImageSent(
  ip: string | null,
  deviceId: string | null,
  userId?: string | null,
): Promise<number> {
  try {
    const svc = createServiceRoleClient();
    const { data } = await svc.rpc("increment_daily_image_count", {
      p_ip: ip ?? "",
      p_device_id: deviceId ?? "",
      p_user_id: userId ?? null,
    });
    return (data as number) ?? 1;
  } catch {
    return 1;
  }
}

/**
 * Check whether this identity can do a gender-filtered match today.
 * "any" / "regardless" matches are always allowed.
 * Pro users are always allowed.
 */
export async function checkGenderSkipAllowed(
  ip: string | null,
  deviceId: string | null,
  wantsGender: string | undefined | null,
  isPro: boolean,
): Promise<{ allowed: true; remaining: number } | { allowed: false; reason: string; used: number }> {
  // "any" / regardless matches are never counted
  if (!wantsGender || wantsGender === "any") return { allowed: true, remaining: Infinity };
  if (isPro) return { allowed: true, remaining: Infinity };

  try {
    const svc = createServiceRoleClient();
    const { data } = await svc.rpc("get_daily_gender_skips", {
      p_ip: ip ?? "",
      p_device_id: deviceId ?? "",
    });
    const used = (data as number) ?? 0;
    const remaining = Math.max(0, FREE_DAILY_GENDER_SKIP_LIMIT - used);
    if (used >= FREE_DAILY_GENDER_SKIP_LIMIT) {
      return { allowed: false, reason: "daily_gender_limit", used };
    }
    return { allowed: true, remaining };
  } catch {
    return { allowed: true, remaining: FREE_DAILY_GENDER_SKIP_LIMIT };
  }
}

/**
 * Increment the gender-skip counter for this identity.
 * Returns { newCount, remaining }.
 */
export async function recordGenderSkip(
  ip: string | null,
  deviceId: string | null,
  userId?: string | null,
): Promise<{ newCount: number; remaining: number }> {
  try {
    const svc = createServiceRoleClient();
    const { data } = await svc.rpc("increment_daily_gender_skips", {
      p_ip: ip ?? "",
      p_device_id: deviceId ?? "",
      p_user_id: userId ?? null,
    });
    const newCount = (data as number) ?? 1;
    return {
      newCount,
      remaining: Math.max(0, FREE_DAILY_GENDER_SKIP_LIMIT - newCount),
    };
  } catch {
    return { newCount: 1, remaining: FREE_DAILY_GENDER_SKIP_LIMIT - 1 };
  }
}
