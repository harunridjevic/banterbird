import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/ops/dm-cleanup
 * Deletes all DM messages older than 30 days.
 * Call this from a scheduled job (Vercel cron / Supabase pg_cron).
 * Protected by CRON_SECRET env var.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const svc = createServiceRoleClient();
  const { error, count } = await svc
    .from("dm_messages")
    .delete({ count: "exact" })
    .lt("created_at", thirtyDaysAgo.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
