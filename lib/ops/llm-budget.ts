import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

export async function shouldSkipLlmForBudget(roomId: string, isOpener = false): Promise<boolean> {
  // Never downgrade mid-conversation replies to canned fallbacks for budget.
  if (!isOpener) return false;
  if (await isLlmDailyBudgetExceeded()) return true;
  const count = await roomLlmCallCount(roomId);
  return count >= llmMaxCallsPerRoom();
}
