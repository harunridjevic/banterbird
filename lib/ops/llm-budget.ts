import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendOpsAlertEmail } from "@/lib/ops/alert-email";
import {
  loadAppSettings,
  llmGuardSensitivityMultiplier,
  type LlmGuardSettings,
} from "@/lib/ops/app-settings";

const LLM_PROVIDERS = ["cerebras", "groq", "gemini", "openai"] as const;

export type UserLlmUsageProfile = {
  calls10Min: number;
  callsHour: number;
  callsDay: number;
  sessionMinutes: number;
  rooms: number;
  costDayUsd: number;
};

export function llmDailyBudgetUsd(): number | null {
  const raw = process.env.LLM_DAILY_BUDGET_USD?.trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function llmMaxCallsPerRoom(): number {
  const raw = process.env.LLM_MAX_CALLS_PER_ROOM?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 12;
  return Number.isFinite(n) && n > 0 ? n : 12;
}

/** Soft hourly cap — falls back to canned replies, never blocks. */
export function llmSoftCallsPerUserHour(): number {
  const raw = process.env.LLM_SOFT_CALLS_PER_USER_HOUR?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 100;
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/** Soft daily cap — falls back to canned replies, never blocks. */
export function llmSoftCallsPerUserDay(): number {
  const raw = process.env.LLM_SOFT_CALLS_PER_USER_DAY?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 250;
  return Number.isFinite(n) && n > 0 ? n : 250;
}

/** Global calls in a 10-minute window that trigger a spike email. */
export function llmSpikeCallsPer10Min(): number {
  const raw = process.env.LLM_SPIKE_CALLS_PER_10_MIN?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 120;
  return Number.isFinite(n) && n > 0 ? n : 120;
}

/** Auto-block only above this estimated USD spend in a UTC day. */
export function llmAutoBlockCostUsdDay(): number {
  const raw = process.env.LLM_AUTO_BLOCK_COST_USD_DAY?.trim();
  const n = raw ? Number.parseFloat(raw) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export async function isLlmDailyBudgetExceeded(): Promise<boolean> {
  const budget = llmDailyBudgetUsd();
  if (budget === null) return false;

  try {
    const admin = createServiceRoleClient();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);

    const { data, error } = await admin
      .from("api_usage_logs")
      .select("estimated_cost_usd")
      .gte("created_at", since.toISOString())
      .in("provider", [...LLM_PROVIDERS]);

    if (error) {
      console.error("llm budget check", error);
      return false;
    }

    const spent = (data ?? []).reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
      0,
    );
    return spent >= budget;
  } catch (e) {
    console.error("llm budget check", e);
    return false;
  }
}

export async function roomLlmCallCount(roomId: string): Promise<number> {
  try {
    const admin = createServiceRoleClient();
    const { count, error } = await admin
      .from("api_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId)
      .in("provider", [...LLM_PROVIDERS]);

    if (error) {
      console.error("room llm count", error);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    console.error("room llm count", e);
    return 0;
  }
}

async function userLlmCallCountSince(userId: string, sinceIso: string): Promise<number> {
  try {
    const admin = createServiceRoleClient();
    const { count, error } = await admin
      .from("api_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .in("provider", [...LLM_PROVIDERS]);

    if (error) {
      console.error("user llm count", error);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    console.error("user llm count", e);
    return 0;
  }
}

export async function getUserLlmUsageProfile(userId: string): Promise<UserLlmUsageProfile> {
  const now = Date.now();
  const since10Min = new Date(now - 10 * 60_000).toISOString();
  const sinceHour = new Date(now - 60 * 60_000).toISOString();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const sinceDay = dayStart.toISOString();

  try {
    const admin = createServiceRoleClient();
    const [calls10Min, callsHour, callsDay, usageRpc, costRows] = await Promise.all([
      userLlmCallCountSince(userId, since10Min),
      userLlmCallCountSince(userId, sinceHour),
      userLlmCallCountSince(userId, sinceDay),
      admin.rpc("ops_blocked_user_usage", { p_user_id: userId }),
      admin
        .from("api_usage_logs")
        .select("estimated_cost_usd")
        .eq("user_id", userId)
        .gte("created_at", sinceDay)
        .in("provider", [...LLM_PROVIDERS]),
    ]);

    const usage = usageRpc.data as
      | { apiCalls?: number; rooms?: number; sessionMinutes?: number }
      | null;

    const costDayUsd = (costRows.data ?? []).reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
      0,
    );

    return {
      calls10Min,
      callsHour,
      callsDay,
      sessionMinutes: Number(usage?.sessionMinutes ?? 0),
      rooms: Number(usage?.rooms ?? 0),
      costDayUsd,
    };
  } catch (e) {
    console.error("getUserLlmUsageProfile", e);
    return {
      calls10Min: 0,
      callsHour: 0,
      callsDay: 0,
      sessionMinutes: 0,
      rooms: 0,
      costDayUsd: 0,
    };
  }
}

/** Only flag obvious cost-attack patterns — not normal heavy chatters. */
export function isInsaneLlmAbuse(
  profile: UserLlmUsageProfile,
  guards: LlmGuardSettings,
): {
  insane: boolean;
  reason?: string;
} {
  const m = llmGuardSensitivityMultiplier(guards.sensitivity);
  const sessionMinutes = Math.max(profile.sessionMinutes, 0.1);
  const callsPerMinOnline = profile.callsDay / sessionMinutes;
  const callsPerRoom = profile.rooms > 0 ? profile.callsDay / profile.rooms : profile.callsDay;

  const costThreshold = guards.autoBlockCostUsdDay * m;
  const burst10Min = Math.round(60 * m);
  const sustainedHourly = Math.round(100 * m);
  const sustainedDensity = 6 / m;
  const roomHopRooms = Math.round(15 * m);
  const roomHopCalls = Math.round(80 * m);
  const roomDensityRooms = Math.round(8 * m);
  const roomDensityPerRoom = 15 / m;
  const scriptedDayCalls = Math.round(120 * m);
  const scriptedMaxMinutes = 10 * m;
  const shortSessionMinutes = 3 * m;
  const shortSessionHourly = Math.round(40 * m);
  const extremeDayCalls = Math.round(500 * m);
  const extremeCost = 1 / m;
  const extremeDensity = 10 / m;

  if (profile.costDayUsd >= costThreshold) {
    return {
      insane: true,
      reason: `estimated LLM cost $${profile.costDayUsd.toFixed(2)} today`,
    };
  }

  if (profile.calls10Min >= burst10Min) {
    return {
      insane: true,
      reason: `${profile.calls10Min} LLM calls in 10 minutes`,
    };
  }

  if (profile.callsHour >= sustainedHourly && callsPerMinOnline >= sustainedDensity) {
    return {
      insane: true,
      reason: `${profile.callsHour} calls/hour (${callsPerMinOnline.toFixed(1)}/min online)`,
    };
  }

  if (profile.rooms >= roomHopRooms && profile.callsHour >= roomHopCalls) {
    return {
      insane: true,
      reason: `${profile.callsHour} calls across ${profile.rooms} rooms in an hour`,
    };
  }

  if (profile.rooms >= roomDensityRooms && callsPerRoom >= roomDensityPerRoom) {
    return {
      insane: true,
      reason: `${profile.callsDay} calls across ${profile.rooms} rooms (${callsPerRoom.toFixed(0)}/room)`,
    };
  }

  if (profile.callsDay >= scriptedDayCalls && profile.sessionMinutes < scriptedMaxMinutes) {
    return {
      insane: true,
      reason: `${profile.callsDay} LLM calls with only ${profile.sessionMinutes} min online`,
    };
  }

  if (profile.sessionMinutes < shortSessionMinutes && profile.callsHour >= shortSessionHourly) {
    return {
      insane: true,
      reason: `${profile.callsHour} calls in under ${Math.round(shortSessionMinutes)} min online`,
    };
  }

  if (
    profile.callsDay >= extremeDayCalls &&
    (profile.costDayUsd >= extremeCost || callsPerMinOnline >= extremeDensity)
  ) {
    return {
      insane: true,
      reason: `${profile.callsDay} LLM calls today with abnormal usage pattern`,
    };
  }

  return { insane: false };
}

async function autoBlockUserForOverusage(userId: string, reason: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    await admin.from("moderation_blocks").upsert(
      {
        block_type: "user",
        block_value: userId,
        reason: `Automatic block: LLM abuse (${reason})`,
        active: true,
        created_by: "llm_overusage",
      },
      { onConflict: "block_type,block_value" },
    );
  } catch (e) {
    console.error("autoBlockUserForOverusage", e);
  }
}

let lastSpikeAlertAt = 0;

export async function maybeAlertLlmUsageSpike(): Promise<void> {
  const now = Date.now();
  if (now - lastSpikeAlertAt < 30 * 60_000) return;

  try {
    const admin = createServiceRoleClient();
    const since = new Date(now - 10 * 60_000).toISOString();
    const { count, error } = await admin
      .from("api_usage_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since)
      .in("provider", [...LLM_PROVIDERS]);

    if (error) {
      console.error("spike check", error);
      return;
    }

    const calls = count ?? 0;
    const threshold = llmSpikeCallsPer10Min();
    if (calls < threshold) return;

    lastSpikeAlertAt = now;
    await sendOpsAlertEmail(
      `[BanterBird] LLM usage spike: ${calls} calls in 10 min`,
      [
        `BanterBird detected elevated AI API usage.`,
        ``,
        `Calls in last 10 minutes: ${calls}`,
        `Alert threshold: ${threshold}`,
        `Time (UTC): ${new Date().toISOString()}`,
        ``,
        `Check /ops/banterbird-stats and /ops/moderation.`,
      ].join("\n"),
    );
  } catch (e) {
    console.error("maybeAlertLlmUsageSpike", e);
  }
}

export type LlmAbuseResult = {
  blocked: boolean;
  reason?: "abuse" | "soft_hourly" | "soft_daily" | "budget" | "room_cap";
};

/** Enforce caps — auto-block only for insane cost-attack patterns. */
export async function enforceLlmUsageGuards(
  userId: string,
  roomId: string,
  isOpener = false,
): Promise<LlmAbuseResult> {
  void maybeAlertLlmUsageSpike();

  const appSettings = await loadAppSettings();
  const guards = appSettings.llmGuards;

  const [profile, roomCount, budgetHit] = await Promise.all([
    getUserLlmUsageProfile(userId),
    roomLlmCallCount(roomId),
    isLlmDailyBudgetExceeded(),
  ]);

  const abuse = isInsaneLlmAbuse(profile, guards);
  if (abuse.insane && guards.autoBlockEnabled) {
    await autoBlockUserForOverusage(userId, abuse.reason ?? "pattern match");
    await sendOpsAlertEmail(
      `[BanterBird] User auto-blocked for LLM abuse`,
      [
        `A user matched an LLM abuse pattern and was auto-blocked.`,
        ``,
        `User ID: ${userId}`,
        `Reason: ${abuse.reason}`,
        `Calls (10m / 1h / day): ${profile.calls10Min} / ${profile.callsHour} / ${profile.callsDay}`,
        `Online time: ${profile.sessionMinutes} min`,
        `Rooms: ${profile.rooms}`,
        `Est. cost today: $${profile.costDayUsd.toFixed(4)}`,
        `Room: ${roomId}`,
        `Time (UTC): ${new Date().toISOString()}`,
      ].join("\n"),
    );
    return { blocked: true, reason: "abuse" };
  }

  if (profile.callsHour >= guards.softHourlyCap) {
    return { blocked: true, reason: "soft_hourly" };
  }

  if (profile.callsDay >= guards.softDailyCap) {
    return { blocked: true, reason: "soft_daily" };
  }

  if (budgetHit && isOpener) {
    return { blocked: true, reason: "budget" };
  }

  if (isOpener && roomCount >= llmMaxCallsPerRoom()) {
    return { blocked: true, reason: "room_cap" };
  }

  return { blocked: false };
}

export async function shouldSkipLlmForBudget(roomId: string, isOpener = false): Promise<boolean> {
  if (!isOpener) return false;
  if (await isLlmDailyBudgetExceeded()) return true;
  const count = await roomLlmCallCount(roomId);
  return count >= llmMaxCallsPerRoom();
}
