import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendOpsAlertEmail } from "@/lib/ops/alert-email";

const LLM_PROVIDERS = ["groq", "gemini", "openai"] as const;

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

/** Soft per-user hourly cap before we treat traffic as abuse. */
export function llmMaxCallsPerUserHour(): number {
  const raw = process.env.LLM_MAX_CALLS_PER_USER_HOUR?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 40;
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/** Hard daily per-user cap; exceeding auto-blocks the user. */
export function llmMaxCallsPerUserDay(): number {
  const raw = process.env.LLM_MAX_CALLS_PER_USER_DAY?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 120;
  return Number.isFinite(n) && n > 0 ? n : 120;
}

/** Global calls in a 10-minute window that trigger a spike email. */
export function llmSpikeCallsPer10Min(): number {
  const raw = process.env.LLM_SPIKE_CALLS_PER_10_MIN?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 80;
  return Number.isFinite(n) && n > 0 ? n : 80;
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

export async function userLlmCallCountSince(userId: string, sinceIso: string): Promise<number> {
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

async function autoBlockUserForOverusage(userId: string, reason: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    await admin.from("moderation_blocks").upsert(
      {
        block_type: "user",
        block_value: userId,
        reason,
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

/** Email ops when global LLM traffic spikes; cooldown 30 minutes. */
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
  reason?: "hourly_cap" | "daily_cap" | "budget" | "room_cap";
};

/** Enforce per-user / room / budget caps; auto-block daily abusers. */
export async function enforceLlmUsageGuards(
  userId: string,
  roomId: string,
  isOpener = false,
): Promise<LlmAbuseResult> {
  void maybeAlertLlmUsageSpike();

  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayIso = dayStart.toISOString();

  const [hourly, daily, roomCount, budgetHit] = await Promise.all([
    userLlmCallCountSince(userId, hourAgo),
    userLlmCallCountSince(userId, dayIso),
    roomLlmCallCount(roomId),
    isLlmDailyBudgetExceeded(),
  ]);

  if (daily >= llmMaxCallsPerUserDay()) {
    await autoBlockUserForOverusage(
      userId,
      `Automatic block: LLM overusage (${daily} API calls today)`,
    );
    await sendOpsAlertEmail(
      `[BanterBird] User auto-blocked for LLM overusage`,
      [
        `A user hit the daily LLM call cap and was auto-blocked.`,
        ``,
        `User ID: ${userId}`,
        `Calls today: ${daily}`,
        `Daily cap: ${llmMaxCallsPerUserDay()}`,
        `Room: ${roomId}`,
        `Time (UTC): ${new Date().toISOString()}`,
      ].join("\n"),
    );
    return { blocked: true, reason: "daily_cap" };
  }

  if (hourly >= llmMaxCallsPerUserHour()) {
    return { blocked: true, reason: "hourly_cap" };
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
  // Never downgrade mid-conversation replies to canned fallbacks for budget.
  if (!isOpener) return false;
  if (await isLlmDailyBudgetExceeded()) return true;
  const count = await roomLlmCallCount(roomId);
  return count >= llmMaxCallsPerRoom();
}
