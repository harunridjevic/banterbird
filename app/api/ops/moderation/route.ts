import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadAppSettings } from "@/lib/ops/app-settings";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";
  const reportsLimit = Math.min(parseInt(url.searchParams.get("reportsLimit") ?? "50", 10), 200);
  const blocksLimit = Math.min(parseInt(url.searchParams.get("blocksLimit") ?? "25", 10), 100);
  const blocksOffset = Math.max(parseInt(url.searchParams.get("blocksOffset") ?? "0", 10), 0);
  const ipHours = Math.min(Math.max(parseInt(url.searchParams.get("ipHours") ?? "24", 10), 1), 168);
  const ipLimit = Math.min(Math.max(parseInt(url.searchParams.get("ipLimit") ?? "3", 10), 1), 3);

  const admin = createServiceRoleClient();
  let query = admin
    .from("user_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(reportsLimit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: reports, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count: blocksTotal, error: blocksCountErr } = await admin
    .from("moderation_blocks")
    .select("*", { count: "exact", head: true })
    .eq("active", true);

  const { data: blocks, error: blocksErr } = await admin
    .from("moderation_blocks")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .range(blocksOffset, blocksOffset + blocksLimit - 1);

  if (blocksErr) {
    return NextResponse.json({ error: blocksErr.message }, { status: 500 });
  }

  const usageByUser: Record<
    string,
    { apiCalls: number; rooms: number; sessionMinutes: number }
  > = {};

  const userBlocks = (blocks ?? []).filter(
    (b) => b.block_type === "user" && typeof b.block_value === "string",
  );

  await Promise.all(
    userBlocks.map(async (b) => {
      const { data } = await admin.rpc("ops_blocked_user_usage", {
        p_user_id: b.block_value,
      });
      if (data && typeof data === "object") {
        const row = data as { apiCalls?: number; rooms?: number; sessionMinutes?: number };
        usageByUser[b.block_value] = {
          apiCalls: Number(row.apiCalls ?? 0),
          rooms: Number(row.rooms ?? 0),
          sessionMinutes: Number(row.sessionMinutes ?? 0),
        };
      }
    }),
  );

  const blockRows = blocks ?? [];
  const totalBlocks = blocksCountErr ? blockRows.length : (blocksTotal ?? blockRows.length);

  const [{ data: topIpsRaw }, { data: ipBlocks }, llmGuards] = await Promise.all([
    admin.rpc("ops_top_ips_by_usage", { p_hours: ipHours, p_limit: ipLimit }),
    admin
      .from("moderation_blocks")
      .select("block_value")
      .eq("active", true)
      .eq("block_type", "ip"),
    loadAppSettings(),
  ]);

  const blockedIpSet = new Set(
    (ipBlocks ?? []).map((row) => String(row.block_value ?? "").trim()).filter(Boolean),
  );

  const topIps = ((topIpsRaw ?? []) as {
    client_ip?: string;
    api_calls?: number;
    distinct_users?: number;
    estimated_cost_usd?: number;
    last_seen_at?: string;
  }[]).map((row) => ({
    clientIp: row.client_ip ?? "",
    apiCalls: Number(row.api_calls ?? 0),
    distinctUsers: Number(row.distinct_users ?? 0),
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    lastSeenAt: row.last_seen_at ?? null,
    blocked: blockedIpSet.has(row.client_ip ?? ""),
  }));

  return NextResponse.json({
    reports: reports ?? [],
    blocks: blockRows,
    usageByUser,
    blocksTotal: totalBlocks,
    blocksHasMore: blocksOffset + blockRows.length < totalBlocks,
    blocksOffset,
    blocksLimit,
    topIps,
    ipHours,
    llmGuards: llmGuards.llmGuards,
  });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    action?: string;
    reportId?: string;
    blockType?: "ip" | "device" | "user";
    blockValue?: string;
    reason?: string;
    blockId?: string;
  };

  const admin = createServiceRoleClient();

  if (body.action === "dismiss" && body.reportId) {
    await admin.from("user_reports").update({ status: "dismissed" }).eq("id", body.reportId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "review" && body.reportId) {
    await admin.from("user_reports").update({ status: "reviewed" }).eq("id", body.reportId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "block" && body.blockType && body.blockValue) {
    const { error } = await admin.from("moderation_blocks").upsert(
      {
        block_type: body.blockType,
        block_value: body.blockValue.trim(),
        reason: body.reason?.trim() ?? null,
        active: true,
        created_by: "ops",
      },
      { onConflict: "block_type,block_value" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (body.reportId) {
      await admin.from("user_reports").update({ status: "reviewed" }).eq("id", body.reportId);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "blockAll" && body.reportId) {
    const { data: report } = await admin
      .from("user_reports")
      .select("reported_user_id,reported_device_id,reporter_ip,reported_ip,reason")
      .eq("id", body.reportId)
      .maybeSingle();

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const reason = body.reason?.trim() ?? report.reason ?? null;
    const entries: { block_type: string; block_value: string; reason: string | null; active: boolean; created_by: string }[] = [];

    if (report.reported_user_id) {
      entries.push({
        block_type: "user",
        block_value: report.reported_user_id,
        reason,
        active: true,
        created_by: "ops",
      });
    }
    if (report.reported_device_id) {
      entries.push({
        block_type: "device",
        block_value: report.reported_device_id,
        reason,
        active: true,
        created_by: "ops",
      });
    }
    if (report.reported_ip) {
      entries.push({
        block_type: "ip",
        block_value: report.reported_ip,
        reason,
        active: true,
        created_by: "ops",
      });
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: "Nothing to block on this report" }, { status: 400 });
    }

    const { error } = await admin.from("moderation_blocks").upsert(entries, {
      onConflict: "block_type,block_value",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await admin.from("user_reports").update({ status: "reviewed" }).eq("id", body.reportId);
    return NextResponse.json({ ok: true, blocked: entries.length });
  }

  if (body.action === "unblock" && body.blockId) {
    await admin.from("moderation_blocks").update({ active: false }).eq("id", body.blockId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
