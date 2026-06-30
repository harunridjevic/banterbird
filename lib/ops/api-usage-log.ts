import { createServiceRoleClient } from "@/lib/supabase/service-role";

type LogApiUsageInput = {
  endpoint: string;
  provider: "gemini" | "openai" | "local";
  success: boolean;
  latencyMs: number;
  roomId?: string;
  userId?: string;
};

export async function logApiUsage(input: LogApiUsageInput): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    await admin.from("api_usage_logs").insert({
      endpoint: input.endpoint,
      provider: input.provider,
      success: input.success,
      latency_ms: input.latencyMs,
      room_id: input.roomId ?? null,
      user_id: input.userId ?? null,
    });
  } catch (e) {
    console.error("logApiUsage failed", e);
  }
}
