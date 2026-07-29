import type {
  MessageStyle,
  SexualDisposition,
  TypoRate,
  WritingStyle,
} from "@/lib/ai-practice-bot/persona";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const BOT_SETTINGS_CHANGED_EVENT = "banterbird:bot-settings-changed";

const BOT_SETTINGS_DB_KEY = "bot_settings";
const BOT_SETTINGS_CACHE_MS = 5_000;

let cachedBotSettings: BotSettings | null = null;
let cachedBotSettingsAt = 0;

/** How match page handles human vs bot matching. */
export type MatchMode = "user_choice" | "hidden_bots" | "humans_only";

export type BotSettings = {
  /**
   * user_choice - user picks humans-only vs humans+bot on /match.
   * hidden_bots - always match humans+bot; chat UI hides bot indicators.
   * humans_only - never offer bot matches; user cannot toggle.
   */
  matchMode: MatchMode;

  /**
   * When true, /match shows a single start button, no gender pickers.
   * Users match anyone online; gender is assigned internally for the queue only.
   */
  hideGenderFilters: boolean;

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
  postSkipDelayMs: number;
  /** Fixed wait before bot sends opener when user has not messaged yet. */
  openerDelayMode: "fixed" | "random";
  openerDelayMs: number;
  openerDelayMinMs: number;
  openerDelayMaxMs: number;
  aiMatchDelayMinMs: number;
  aiMatchDelayMaxMs: number;

  maxUserTurnsBeforeSkip: number;
  drySkipMinUserTurns: number;
  strictSexualSkipAt: number;
  longChatSkipAt: number;
  longChatSkipChance: number;
  excuseSkipChance: number;
  sessionHintAt: number;

  llmTemperature: number;
  maxOutputTokens: number;
  maxOutputTokensSexual: number;
  llmHistoryTurns: number;
  maxOutputTokensOpener: number;

  /**
   * When enabled, the navbar online pill shows a synthetic count in the configured
   * range. The value is derived from UTC time so it stays in sync across tabs,
   * devices, and refreshes (given the same saved settings).
   */
  displayOnlineCountOverride: boolean;
  displayOnlineCountMin: number;
  displayOnlineCountMax: number;
  displayOnlineCountChangeMinMs: number;
  displayOnlineCountChangeMaxMs: number;
};

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  matchMode: "user_choice",
  hideGenderFilters: false,

  sexualDisposition: "random",
  strictWeight: 50,
  persuadableWeight: 30,
  hornyWeight: 20,

  writingStyle: "random",
  messageStyle: "random",
  typoRate: "random",

  replySpeed: 1,
  replySpeedMode: "random",

  ghostPingMs: 45_000,
  ghostSkipMs: 20_000,
  postSkipDelayMs: 3000,
  openerDelayMode: "fixed",
  openerDelayMs: 5000,
  openerDelayMinMs: 3000,
  openerDelayMaxMs: 8000,
  aiMatchDelayMinMs: 15000,
  aiMatchDelayMaxMs: 25000,

  maxUserTurnsBeforeSkip: 10,
  drySkipMinUserTurns: 3,
  strictSexualSkipAt: 2,
  longChatSkipAt: 12,
  longChatSkipChance: 12,
  excuseSkipChance: 50,
  sessionHintAt: 5,

  llmTemperature: 1.08,
  maxOutputTokens: 160,
  maxOutputTokensSexual: 256,
  /** Max chat turns sent to the LLM per request. */
  llmHistoryTurns: 50,
  maxOutputTokensOpener: 96,

  displayOnlineCountOverride: false,
  displayOnlineCountMin: 42,
  displayOnlineCountMax: 128,
  displayOnlineCountChangeMinMs: 4000,
  displayOnlineCountChangeMaxMs: 12000,
};

export type SessionPolicy = Pick<
  BotSettings,
  | "maxUserTurnsBeforeSkip"
  | "drySkipMinUserTurns"
  | "strictSexualSkipAt"
  | "longChatSkipAt"
  | "longChatSkipChance"
  | "excuseSkipChance"
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
    excuseSkipChance: s.excuseSkipChance,
    sessionHintAt: s.sessionHintAt,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

const MATCH_MODES: MatchMode[] = ["user_choice", "hidden_bots", "humans_only"];

function normalizeMatchMode(v: unknown): MatchMode {
  return MATCH_MODES.includes(v as MatchMode) ? (v as MatchMode) : DEFAULT_BOT_SETTINGS.matchMode;
}

const OPENER_DELAY_MODES = ["fixed", "random"] as const;
const SEXUAL_DISPOSITION_MODES = ["random", "strict", "persuadable", "horny"] as const;

function normalizeSexualDisposition(v: unknown): BotSettings["sexualDisposition"] {
  return SEXUAL_DISPOSITION_MODES.includes(v as BotSettings["sexualDisposition"])
    ? (v as BotSettings["sexualDisposition"])
    : DEFAULT_BOT_SETTINGS.sexualDisposition;
}

function normalizeOpenerDelayMode(v: unknown): BotSettings["openerDelayMode"] {
  return OPENER_DELAY_MODES.includes(v as BotSettings["openerDelayMode"])
    ? (v as BotSettings["openerDelayMode"])
    : DEFAULT_BOT_SETTINGS.openerDelayMode;
}

function mergeWithDefaults(partial: Partial<BotSettings>): BotSettings {
  const merged = { ...DEFAULT_BOT_SETTINGS, ...partial };
  const openerDelayMinMs = clamp(merged.openerDelayMinMs, 0, 60_000);
  const openerDelayMaxMs = clamp(Math.max(merged.openerDelayMaxMs, openerDelayMinMs), 0, 60_000);
  return {
    ...merged,
    matchMode: normalizeMatchMode(merged.matchMode),
    hideGenderFilters: Boolean(merged.hideGenderFilters),
    sexualDisposition: normalizeSexualDisposition(merged.sexualDisposition),
    openerDelayMode: normalizeOpenerDelayMode(merged.openerDelayMode),
    strictWeight: clamp(merged.strictWeight, 0, 100),
    persuadableWeight: clamp(merged.persuadableWeight, 0, 100),
    hornyWeight: clamp(merged.hornyWeight, 0, 100),
    replySpeed: clamp(merged.replySpeed, 0.55, 1.65),
    ghostPingMs: clamp(merged.ghostPingMs, 1000, 120_000),
    ghostSkipMs: clamp(merged.ghostSkipMs, 1000, 120_000),
    postSkipDelayMs: clamp(merged.postSkipDelayMs, 0, 60_000),
    openerDelayMs: clamp(merged.openerDelayMs, 0, 60_000),
    openerDelayMinMs,
    openerDelayMaxMs,
    aiMatchDelayMinMs: clamp(merged.aiMatchDelayMinMs, 0, 60_000),
    aiMatchDelayMaxMs: clamp(Math.max(merged.aiMatchDelayMaxMs, merged.aiMatchDelayMinMs), 0, 60_000),
    maxUserTurnsBeforeSkip: clamp(Math.round(merged.maxUserTurnsBeforeSkip), 1, 50),
    drySkipMinUserTurns: clamp(Math.round(merged.drySkipMinUserTurns), 1, 20),
    strictSexualSkipAt: clamp(Math.round(merged.strictSexualSkipAt), 1, 10),
    longChatSkipAt: clamp(Math.round(merged.longChatSkipAt), 1, 50),
    longChatSkipChance: clamp(merged.longChatSkipChance, 0, 100),
    excuseSkipChance: clamp(merged.excuseSkipChance, 0, 100),
    sessionHintAt: clamp(Math.round(merged.sessionHintAt), 1, 30),
    llmTemperature: clamp(merged.llmTemperature, 0, 2),
    maxOutputTokens: clamp(Math.round(merged.maxOutputTokens), 64, 4096),
    maxOutputTokensSexual: clamp(Math.round(merged.maxOutputTokensSexual), 64, 4096),
    llmHistoryTurns: clamp(Math.round(merged.llmHistoryTurns), 4, 80),
    maxOutputTokensOpener: clamp(Math.round(merged.maxOutputTokensOpener), 32, 512),
    displayOnlineCountOverride: Boolean(merged.displayOnlineCountOverride),
    displayOnlineCountMin: clamp(Math.round(merged.displayOnlineCountMin), 0, 99_999),
    displayOnlineCountMax: clamp(
      Math.max(Math.round(merged.displayOnlineCountMax), Math.round(merged.displayOnlineCountMin)),
      0,
      99_999,
    ),
    displayOnlineCountChangeMinMs: clamp(Math.round(merged.displayOnlineCountChangeMinMs), 500, 600_000),
    displayOnlineCountChangeMaxMs: clamp(
      Math.max(
        Math.round(merged.displayOnlineCountChangeMaxMs),
        Math.round(merged.displayOnlineCountChangeMinMs),
      ),
      500,
      600_000,
    ),
  };
}

export function randomIntInclusive(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Ms to wait before the bot speaks first if the user has not messaged. */
export function resolveOpenerDelayMs(settings?: BotSettings | null): number {
  const s = settings ?? DEFAULT_BOT_SETTINGS;
  if (s.openerDelayMode === "random") {
    const span = Math.max(0, s.openerDelayMaxMs - s.openerDelayMinMs);
    return s.openerDelayMinMs + Math.floor(Math.random() * (span + 1));
  }
  return s.openerDelayMs;
}

/** Internal queue genders when gender filters are hidden from the user. */
export function anonymousMatchGenders(): { self: "male" | "female"; wants: "any" } {
  return {
    self: Math.random() < 0.5 ? "male" : "female",
    wants: "any",
  };
}

export function invalidateBotSettingsCache() {
  cachedBotSettings = null;
  cachedBotSettingsAt = 0;
}

export async function loadBotSettingsFromDb(): Promise<BotSettings> {
  const now = Date.now();
  if (cachedBotSettings && now - cachedBotSettingsAt < BOT_SETTINGS_CACHE_MS) {
    return cachedBotSettings;
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", BOT_SETTINGS_DB_KEY)
      .maybeSingle();

    if (error || !data?.value) {
      cachedBotSettings = DEFAULT_BOT_SETTINGS;
      cachedBotSettingsAt = now;
      return cachedBotSettings;
    }

    cachedBotSettings = mergeWithDefaults(data.value as Partial<BotSettings>);
    cachedBotSettingsAt = now;
    return cachedBotSettings;
  } catch {
    return DEFAULT_BOT_SETTINGS;
  }
}

export async function saveBotSettingsToDb(settings: BotSettings): Promise<BotSettings> {
  const normalized = mergeWithDefaults(settings);
  const admin = createServiceRoleClient();
  const now = new Date().toISOString();

  await admin.from("app_settings").upsert([
    { key: BOT_SETTINGS_DB_KEY, value: normalized, updated_at: now },
  ]);

  cachedBotSettings = normalized;
  cachedBotSettingsAt = Date.now();
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
