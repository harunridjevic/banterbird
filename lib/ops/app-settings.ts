import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type RateLimitSettings = {
  enabled: boolean;
  maxMessagesPerMinute: number;
  maxMessagesPer10Seconds: number;
  maxRematchesPerMinute: number;
  blockDurationMinutes: number;
};

export type AgeGateSettings = {
  enabled: boolean;
  minimumAge: number;
};

export type AppSettings = {
  rateLimiting: RateLimitSettings;
  ageGate: AgeGateSettings;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  rateLimiting: {
    enabled: true,
    maxMessagesPerMinute: 20,
    maxMessagesPer10Seconds: 5,
    maxRematchesPerMinute: 8,
    blockDurationMinutes: 15,
  },
  ageGate: {
    enabled: true,
    minimumAge: 18,
  },
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function normalizeRateLimitSettings(raw: Partial<RateLimitSettings>): RateLimitSettings {
  const d = DEFAULT_APP_SETTINGS.rateLimiting;
  return {
    enabled: raw.enabled ?? d.enabled,
    maxMessagesPerMinute: clamp(Math.round(raw.maxMessagesPerMinute ?? d.maxMessagesPerMinute), 1, 200),
    maxMessagesPer10Seconds: clamp(Math.round(raw.maxMessagesPer10Seconds ?? d.maxMessagesPer10Seconds), 1, 50),
    maxRematchesPerMinute: clamp(Math.round(raw.maxRematchesPerMinute ?? d.maxRematchesPerMinute), 1, 60),
    blockDurationMinutes: clamp(Math.round(raw.blockDurationMinutes ?? d.blockDurationMinutes), 1, 1440),
  };
}

export function normalizeAgeGateSettings(raw: Partial<AgeGateSettings>): AgeGateSettings {
  const d = DEFAULT_APP_SETTINGS.ageGate;
  return {
    enabled: raw.enabled ?? d.enabled,
    minimumAge: clamp(Math.round(raw.minimumAge ?? d.minimumAge), 13, 21),
  };
}

export function normalizeAppSettings(partial: {
  rateLimiting?: Partial<RateLimitSettings>;
  ageGate?: Partial<AgeGateSettings>;
}): AppSettings {
  return {
    rateLimiting: normalizeRateLimitSettings(partial.rateLimiting ?? {}),
    ageGate: normalizeAgeGateSettings(partial.ageGate ?? {}),
  };
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from("app_settings").select("key, value");
    if (error || !data) return DEFAULT_APP_SETTINGS;

    const map = Object.fromEntries(data.map((row) => [row.key, row.value]));
    return normalizeAppSettings({
      rateLimiting: (map.rate_limiting ?? {}) as Partial<RateLimitSettings>,
      ageGate: (map.age_gate ?? {}) as Partial<AgeGateSettings>,
    });
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(settings);
  const admin = createServiceRoleClient();
  const now = new Date().toISOString();

  await admin.from("app_settings").upsert([
    { key: "rate_limiting", value: normalized.rateLimiting, updated_at: now },
    { key: "age_gate", value: normalized.ageGate, updated_at: now },
  ]);

  return normalized;
}
