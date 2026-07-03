import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ErrorLogInput = {
  source: string;
  level?: "error" | "warn" | "info";
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
};

export async function logError(input: ErrorLogInput): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    await admin.from("error_logs").insert({
      source: input.source.slice(0, 200),
      level: input.level ?? "error",
      message: input.message.slice(0, 4000),
      stack: input.stack?.slice(0, 8000) ?? null,
      metadata: input.metadata ?? {},
      user_id: input.userId ?? null,
    });
  } catch (e) {
    console.error("logError failed", e);
  }
}
