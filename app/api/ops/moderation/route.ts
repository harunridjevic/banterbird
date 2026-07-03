import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { clientIp } from "@/lib/moderation/client-ip";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const admin = createServiceRoleClient();
  let query = admin
    .from("user_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: reports, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: blocks } = await admin
    .from("moderation_blocks")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  return NextResponse.json({ reports: reports ?? [], blocks: blocks ?? [] });
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
