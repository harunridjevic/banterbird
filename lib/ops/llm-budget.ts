import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendOpsAlertEmail } from "@/lib/ops/alert-email";

const LLM_PROVIDERS = ["groq", "gemini", "openai"] as const;

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
export function isInsaneLlmAbuse(profile: UserLlmUsageProfile): {
  insane: boolean;
  reason?: string;
} {
  const sessionMinutes = Math.max(profile.sessionMinutes, 0.1);
  const callsPerMinOnline = profile.callsDay / sessionMinutes;
  const callsPerRoom = profile.rooms > 0 ? profile.callsDay / profile.rooms : profile.callsDay;

  if (profile.costDayUsd >= llmAutoBlockCostUsdDay()) {
    return {
      insane: true,
      reason: `estimated LLM cost $${profile.costDayUsd.toFixed(2)} today`,
    };
  }

  if (profile.calls10Min >= 60) {
    return {
      insane: true,
      reason: `${profile.calls10Min} LLM calls in 10 minutes`,
    };
  }

  // Sustained high volume with abnormal call density for time spent on site.
  if (profile.callsHour >= 100 && callsPerMinOnline >= 6) {
    return {
      insane: true,
      reason: `${profile.callsHour} calls/hour (${callsPerMinOnline.toFixed(1)}/min online)`,
    };
  }

  // Room-hopping API farming.
  if (profile.rooms >= 15 && profile.callsHour >= 80) {
    return {
      insane: true,
      reason: `${profile.callsHour} calls across ${profile.rooms} rooms in an hour`,
    };
  }

  if (profile.rooms >= 8 && callsPerRoom >= 15) {
    return {
      insane: true,
      reason: `${profile.callsDay} calls across ${profile.rooms} rooms (${callsPerRoom.toFixed(0)}/room)`,
    };
  }

  // Scripted abuse: huge call volume with almost no real browsing time.
  if (profile.callsDay >= 120 && profile.sessionMinutes < 10) {
    return {
      insane: true,
      reason: `${profile.callsDay} LLM calls with only ${profile.sessionMinutes} min online`,
    };
  }

  // Very short sessions spamming API.
  if (profile.sessionMinutes < 3 && profile.callsHour >= 40) {
    return {
      insane: true,
      reason: `${profile.callsHour} calls in under 3 min online`,
    };
  }

  // Extreme absolute only when paired with meaningful cost or density.
  if (profile.callsDay >= 500 && (profile.costDayUsd >= 1 || callsPerMinOnline >= 10)) {
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

  const [profile, roomCount, budgetHit] = await Promise.all([
    getUserLlmUsageProfile(userId),
    roomLlmCallCount(roomId),
    isLlmDailyBudgetExceeded(),
  ]);

  const abuse = isInsaneLlmAbuse(profile);
  if (abuse.insane) {
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

  if (profile.callsHour >= llmSoftCallsPerUserHour()) {
    return { blocked: true, reason: "soft_hourly" };
  }

  if (profile.callsDay >= llmSoftCallsPerUserDay()) {
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
