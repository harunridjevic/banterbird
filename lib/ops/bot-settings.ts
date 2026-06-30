import type {
  MessageStyle,
  SexualDisposition,
  TypoRate,
  WritingStyle,
} from "@/lib/ai-practice-bot/persona";

export const BOT_SETTINGS_STORAGE_KEY = "banterbird:bot-settings";
export const BOT_SETTINGS_CHANGED_EVENT = "banterbird:bot-settings-changed";

export type BotSettings = {
  /** Sexual vibe: random uses weights below; otherwise forces every bot. */
  sexualDisposition: "random" | SexualDisposition;
  strictWeight: number;
  persuadableWeight: number;
  hornyWeight: number;

  writingStyle: "random" | WritingStyle;
  messageStyle: "random" | MessageStyle;
  typoRate: "random" | TypoRate;

  /** 0.55 (fast) … 1.65 (slow). Ignored when replySpeedMode is random. */
  replySpeed: number;
  replySpeedMode: "random" | "fixed";

  ghostPingMs: number;
  ghostSkipMs: number;
  openerDelayMs: number;
  aiMatchDelayMinMs: number;
  aiMatchDelayMaxMs: number;

  maxUserTurnsBeforeSkip: number;
  drySkipMinUserTurns: number;
  strictSexualSkipAt: number;
  longChatSkipAt: number;
  longChatSkipChance: number;
  sessionHintAt: number;

  llmTemperature: number;
  maxOutputTokens: number;
  maxOutputTokensSexual: number;
};

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  sexualDisposition: "random",
  strictWeight: 50,
  persuadableWeight: 30,
  hornyWeight: 20,

  writingStyle: "random",
  messageStyle: "random",
  typoRate: "random",

  replySpeed: 1,
  replySpeedMode: "random",

  ghostPingMs: 10_000,
  ghostSkipMs: 6_000,
  openerDelayMs: 1100,
  aiMatchDelayMinMs: 3600,
  aiMatchDelayMaxMs: 5200,

  maxUserTurnsBeforeSkip: 10,
  drySkipMinUserTurns: 3,
  strictSexualSkipAt: 2,
  longChatSkipAt: 12,
  longChatSkipChance: 12,
  sessionHintAt: 5,

  llmTemperature: 1.08,
  maxOutputTokens: 512,
  maxOutputTokensSexual: 768,
};

export type SessionPolicy = Pick<
  BotSettings,
  | "maxUserTurnsBeforeSkip"
  | "drySkipMinUserTurns"
  | "strictSexualSkipAt"
  | "longChatSkipAt"
  | "longChatSkipChance"
  | "sessionHintAt"
>;

export function sessionPolicyFromSettings(settings?: BotSettings | null): SessionPolicy {
  const s = settings ?? DEFAULT_BOT_SETTINGS;
  return {
    maxUserTurnsBeforeSkip: s.maxUserTurnsBeforeSkip,
    drySkipMinUserTurns: s.drySkipMinUserTurns,
    strictSexualSkipAt: s.strictSexualSkipAt,
    longChatSkipAt: s.longChatSkipAt,
    longChatSkipChance: s.longChatSkipChance,
    sessionHintAt: s.sessionHintAt,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function mergeWithDefaults(partial: Partial<BotSettings>): BotSettings {
  const merged = { ...DEFAULT_BOT_SETTINGS, ...partial };
  return {
    ...merged,
    strictWeight: clamp(merged.strictWeight, 0, 100),
    persuadableWeight: clamp(merged.persuadableWeight, 0, 100),
    hornyWeight: clamp(merged.hornyWeight, 0, 100),
    replySpeed: clamp(merged.replySpeed, 0.55, 1.65),
    ghostPingMs: clamp(merged.ghostPingMs, 1000, 120_000),
    ghostSkipMs: clamp(merged.ghostSkipMs, 1000, 120_000),
    openerDelayMs: clamp(merged.openerDelayMs, 0, 30_000),
    aiMatchDelayMinMs: clamp(merged.aiMatchDelayMinMs, 0, 60_000),
    aiMatchDelayMaxMs: clamp(Math.max(merged.aiMatchDelayMaxMs, merged.aiMatchDelayMinMs), 0, 60_000),
    maxUserTurnsBeforeSkip: clamp(Math.round(merged.maxUserTurnsBeforeSkip), 1, 50),
    drySkipMinUserTurns: clamp(Math.round(merged.drySkipMinUserTurns), 1, 20),
    strictSexualSkipAt: clamp(Math.round(merged.strictSexualSkipAt), 1, 10),
    longChatSkipAt: clamp(Math.round(merged.longChatSkipAt), 1, 50),
    longChatSkipChance: clamp(merged.longChatSkipChance, 0, 100),
    sessionHintAt: clamp(Math.round(merged.sessionHintAt), 1, 30),
    llmTemperature: clamp(merged.llmTemperature, 0, 2),
    maxOutputTokens: clamp(Math.round(merged.maxOutputTokens), 64, 4096),
    maxOutputTokensSexual: clamp(Math.round(merged.maxOutputTokensSexual), 64, 4096),
  };
}

export function loadBotSettings(): BotSettings {
  if (typeof window === "undefined") return DEFAULT_BOT_SETTINGS;
  try {
    const raw = localStorage.getItem(BOT_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_BOT_SETTINGS;
    return mergeWithDefaults(JSON.parse(raw) as Partial<BotSettings>);
  } catch {
    return DEFAULT_BOT_SETTINGS;
  }
}

export function saveBotSettings(settings: BotSettings) {
  const normalized = mergeWithDefaults(settings);
  if (typeof window !== "undefined") {
    localStorage.setItem(BOT_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(BOT_SETTINGS_CHANGED_EVENT));
  }
  return normalized;
}

export function parseBotSettings(raw: unknown): BotSettings | null {
  if (!raw || typeof raw !== "object") return null;
  return mergeWithDefaults(raw as Partial<BotSettings>);
}

export function rollSexualDisposition(roll: number, settings?: BotSettings | null): SexualDisposition {
  const s = settings ?? DEFAULT_BOT_SETTINGS;
  if (s.sexualDisposition !== "random") return s.sexualDisposition;

  const total = s.strictWeight + s.persuadableWeight + s.hornyWeight;
  if (total <= 0) return "strict";

  const r = roll % total;
  if (r < s.strictWeight) return "strict";
  if (r < s.strictWeight + s.persuadableWeight) return "persuadable";
  return "horny";
}
