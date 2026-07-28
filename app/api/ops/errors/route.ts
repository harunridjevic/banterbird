import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logError } from "@/lib/ops/error-log";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logError } from "@/lib/ops/error-log";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    // Require a valid Supabase session to prevent log poisoning by outsiders.
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      source?: string;
      level?: "error" | "warn" | "info";
      message?: string;
      stack?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.message?.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    await logError({
      source: body.source ?? "client",
      level: body.level ?? "error",
      message: body.message,
      stack: body.stack,
      metadata: body.metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "25", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

  const admin = createServiceRoleClient();
  const { count, error: countErr } = await admin
    .from("error_logs")
    .select("*", { count: "exact", head: true });

  const { data, error } = await admin
    .from("error_logs")
    .select("id,source,level,message,stack,metadata,user_id,created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = countErr ? (data?.length ?? 0) : (count ?? 0);
  const rows = data ?? [];
  const hasMore = offset + rows.length < total;

  return NextResponse.json({ errors: rows, total, hasMore, offset, limit });
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const clearAll = url.searchParams.get("all") === "1";

  const admin = createServiceRoleClient();

  if (clearAll) {
    const { error } = await admin.from("error_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cleared: "all" });
  }

  if (!id) {
    return NextResponse.json({ error: "id or all=1 required" }, { status: 400 });
  }

  const { error } = await admin.from("error_logs").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cleared: id });
}
