import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PRO_PRICE_USD, PRO_PERIOD_DAYS } from "@/lib/billing/constants";

export type AdsSettings = {
  showBannerAds: boolean;
  showOutstreamAds: boolean;
};

export type BillingSettings = {
  proPriceUsd: number;
  proPeriodDays: number;
};

export type RateLimitSettings = {
  enabled: boolean;
  maxMessagesPerMinute: number;
  maxMessagesPer10Seconds: number;
  blockDurationMinutes: number;
};

export type AgeGateSettings = {
  enabled: boolean;
  minimumAge: number;
};

export type BlockedWordsSettings = {
  enabled: boolean;
  words: string[];
};

export type LlmGuardSensitivity = "low" | "medium" | "high";

export type LlmGuardSettings = {
  autoBlockEnabled: boolean;
  sensitivity: LlmGuardSensitivity;
  autoBlockCostUsdDay: number;
  softHourlyCap: number;
  softDailyCap: number;
};

export type AppSettings = {
  rateLimiting: RateLimitSettings;
  ageGate: AgeGateSettings;
  blockedWords: BlockedWordsSettings;
  llmGuards: LlmGuardSettings;
  billing: BillingSettings;
  ads: AdsSettings;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  rateLimiting: {
    enabled: true,
    maxMessagesPerMinute: 20,
    maxMessagesPer10Seconds: 5,
    blockDurationMinutes: 15,
  },
  ageGate: {
    enabled: false,
    minimumAge: 16,
  },
  blockedWords: {
    enabled: false,
    words: [],
  },
  llmGuards: {
    autoBlockEnabled: true,
    sensitivity: "medium",
    autoBlockCostUsdDay: 5,
    softHourlyCap: 100,
    softDailyCap: 250,
  },
  billing: {
    proPriceUsd: PRO_PRICE_USD,
    proPeriodDays: PRO_PERIOD_DAYS,
  },
  ads: {
    showBannerAds: true,
    showOutstreamAds: true,
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

export function normalizeBlockedWordsSettings(raw: Partial<BlockedWordsSettings>): BlockedWordsSettings {
  const d = DEFAULT_APP_SETTINGS.blockedWords;
  return {
    enabled: raw.enabled ?? d.enabled,
    words: Array.isArray(raw.words) ? raw.words : d.words,
  };
}

export function normalizeLlmGuardSettings(raw: Partial<LlmGuardSettings>): LlmGuardSettings {
  const d = DEFAULT_APP_SETTINGS.llmGuards;
  const sensitivity =
    raw.sensitivity === "low" || raw.sensitivity === "high" || raw.sensitivity === "medium"
      ? raw.sensitivity
      : d.sensitivity;
  return {
    autoBlockEnabled: raw.autoBlockEnabled ?? d.autoBlockEnabled,
    sensitivity,
    autoBlockCostUsdDay: clamp(Number(raw.autoBlockCostUsdDay ?? d.autoBlockCostUsdDay), 0.5, 100),
    softHourlyCap: clamp(Math.round(raw.softHourlyCap ?? d.softHourlyCap), 10, 1000),
    softDailyCap: clamp(Math.round(raw.softDailyCap ?? d.softDailyCap), 20, 5000),
  };
}

export function llmGuardSensitivityMultiplier(sensitivity: LlmGuardSensitivity): number {
  switch (sensitivity) {
    case "low":
      return 2;
    case "high":
      return 0.5;
    default:
      return 1;
  }
}

export function normalizeAdsSettings(raw: Partial<AdsSettings>): AdsSettings {
  const d = DEFAULT_APP_SETTINGS.ads;
  return {
    showBannerAds: raw.showBannerAds ?? d.showBannerAds,
    showOutstreamAds: raw.showOutstreamAds ?? d.showOutstreamAds,
  };
}

export function normalizeBillingSettings(raw: Partial<BillingSettings>): BillingSettings {
  const d = DEFAULT_APP_SETTINGS.billing;
  return {
    proPriceUsd: clamp(Number(raw.proPriceUsd ?? d.proPriceUsd), 1, 999),
    proPeriodDays: clamp(Math.round(raw.proPeriodDays ?? d.proPeriodDays), 1, 365),
  };
}

export function normalizeAppSettings(partial: {
  rateLimiting?: Partial<RateLimitSettings>;
  ageGate?: Partial<AgeGateSettings>;
  blockedWords?: Partial<BlockedWordsSettings>;
  llmGuards?: Partial<LlmGuardSettings>;
  billing?: Partial<BillingSettings>;
  ads?: Partial<AdsSettings>;
}): AppSettings {
  return {
    rateLimiting: normalizeRateLimitSettings(partial.rateLimiting ?? {}),
    ageGate: normalizeAgeGateSettings(partial.ageGate ?? {}),
    blockedWords: normalizeBlockedWordsSettings(partial.blockedWords ?? {}),
    llmGuards: normalizeLlmGuardSettings(partial.llmGuards ?? {}),
    billing: normalizeBillingSettings(partial.billing ?? {}),
    ads: normalizeAdsSettings(partial.ads ?? {}),
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
      blockedWords: (map.blocked_words ?? {}) as Partial<BlockedWordsSettings>,
      llmGuards: (map.llm_guards ?? {}) as Partial<LlmGuardSettings>,
      billing: (map.billing ?? {}) as Partial<BillingSettings>,
      ads: (map.ads ?? {}) as Partial<AdsSettings>,
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
    { key: "blocked_words", value: normalized.blockedWords, updated_at: now },
    { key: "llm_guards", value: normalized.llmGuards, updated_at: now },
    { key: "billing", value: normalized.billing, updated_at: now },
    { key: "ads", value: normalized.ads, updated_at: now },
  ]);

  return normalized;
}
