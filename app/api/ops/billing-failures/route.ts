import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * A unified "failed checkout attempt" — may come from either:
 *   (a) pro_subscriptions with status pending/failed  (server-side row)
 *   (b) error_logs with source billing/checkout or billing/checkout-client
 *       (server or client error that never produced a subscription row)
 */
export type BillingFailureRow = {
  id: string;
  /** "subscription" | "error-log" */
  kind: "subscription" | "error-log";
  user_id: string | null;
  email: string | null;
  status: string;          // pending / failed / error
  message: string | null;  // error message for error-log rows
  provider: string | null;
  order_id: string | null;
  paddle_transaction_id: string | null;
  amount_usd: number | null;
  /** "server" | "client" — where the failure was detected */
  failure_origin: "server" | "client";
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

/**
 * GET /api/ops/billing-failures
 *
 * Returns a merged, time-sorted list of:
 *   1. pro_subscriptions rows where status ∈ {pending, failed}
 *   2. error_logs rows with source ∈ {billing/checkout, billing/checkout-client}
 *      that have no corresponding pro_subscriptions row (de-duped by user+time proximity)
 *
 * Paginated by the combined total, newest first.
 * Auth: ops analytics cookie (same as /api/ops/errors).
 */
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

  // ── 1. Fetch ALL pending/failed subscription rows (no pagination yet — we merge first) ──
  const { data: subs, error: subsErr } = await admin
    .from("pro_subscriptions")
    .select(
      "id, user_id, status, provider, order_id, paddle_transaction_id, amount_usd, created_at, updated_at",
    )
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(500); // reasonable upper bound for merge

  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }

  // ── 2. Fetch ALL billing error_logs (server + client errors) ──────────────
  const { data: errLogs, error: errLogsErr } = await admin
    .from("error_logs")
    .select("id, source, level, message, metadata, user_id, created_at")
    .in("source", ["billing/checkout", "billing/checkout-client"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (errLogsErr) {
    return NextResponse.json({ error: errLogsErr.message }, { status: 500 });
  }

  // ── 3. Build a set of user_ids covered by subscription rows so we can
  //       surface error-log rows that have NO matching sub row separately.
  //       We include an error-log row when:
  //         - its user_id has NO pending/failed sub row at all, OR
  //         - it's a client-side error (billing/checkout-client) — those
  //           happen after the server already returned a transaction ID, so
  //           a pending sub row exists but the error is distinct and worth seeing.
  const subsUserIds = new Set((subs ?? []).map((s) => s.user_id));

  const deduped = (errLogs ?? []).filter((e) => {
    // Always include client-side errors (they are post-transaction failures)
    if (e.source === "billing/checkout-client") return true;
    // For server errors: only include if no sub row exists for this user
    // (avoids showing the same failure twice when both a sub row AND an error log exist)
    if (!e.user_id) return true;
    return !subsUserIds.has(e.user_id);
  });

  // ── 4. Shape both sets into a unified BillingFailureRow ──────────────────
  const subRows: BillingFailureRow[] = (subs ?? []).map((s) => ({
    id: s.id,
    kind: "subscription",
    user_id: s.user_id,
    email: null,
    status: s.status,
    message: null,
    provider: s.provider ?? null,
    order_id: s.order_id ?? null,
    paddle_transaction_id: s.paddle_transaction_id ?? null,
    amount_usd: s.amount_usd ?? null,
    failure_origin: "server",
    metadata: null,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));

  const errRows: BillingFailureRow[] = deduped.map((e) => ({
    id: e.id,
    kind: "error-log",
    user_id: e.user_id ?? null,
    email: (e.metadata as Record<string, unknown> | null)?.email as string | null ?? null,
    status: "error",
    message: e.message ?? null,
    provider: "paddle",
    order_id: null,
    paddle_transaction_id: null,
    amount_usd: null,
    failure_origin: e.source === "billing/checkout-client" ? "client" : "server",
    metadata: e.metadata as Record<string, unknown> | null,
    created_at: e.created_at,
    updated_at: e.created_at,
  }));

  // ── 5. Merge and sort descending by created_at ────────────────────────────
  const merged = [...subRows, ...errRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // ── 6. Paginate the merged list ───────────────────────────────────────────
  const total = merged.length;
  const page = merged.slice(offset, offset + limit);
  const hasMore = offset + page.length < total;

  // ── 7. Enrich page rows with email (profiles → auth.admin fallback) ───────
  const needEmail = page.filter((r) => !r.email && r.user_id);
  if (needEmail.length > 0) {
    const userIds = [...new Set(needEmail.map((r) => r.user_id as string))];

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, username")
      .in("id", userIds);

    const emailMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      emailMap[p.id] = (p.email as string | null) ?? (p.username as string | null) ?? p.id;
    }

    // Fallback to auth.users for any still-unmapped IDs
    const unmapped = userIds.filter((id) => !emailMap[id]);
    if (unmapped.length > 0) {
      await Promise.all(
        unmapped.map(async (uid) => {
          try {
            const { data } = await admin.auth.admin.getUserById(uid);
            if (data?.user?.email) emailMap[uid] = data.user.email;
          } catch {
            // ignore — we'll show user_id as fallback
          }
        }),
      );
    }

    for (const row of page) {
      if (!row.email && row.user_id && emailMap[row.user_id]) {
        row.email = emailMap[row.user_id]!;
      }
    }
  }

  return NextResponse.json({ rows: page, total, hasMore, offset, limit });
}

/**
 * DELETE /api/ops/billing-failures
 *
 * Supports two strategies controlled by ?kind= parameter:
 *   kind=subscription  → delete from pro_subscriptions (pending/failed only)
 *   kind=error-log     → delete from error_logs
 *   (omitted)          → try both tables (best-effort clear for legacy callers)
 *
 * Pass ?id=<uuid> for a single row or ?all=1 to clear everything.
 * Active subscriptions are never touched.
 */
export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(cookieSecret(), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const clearAll = url.searchParams.get("all") === "1";
  const kind = url.searchParams.get("kind"); // "subscription" | "error-log" | null

  const admin = createServiceRoleClient();

  if (clearAll) {
    const errs: string[] = [];

    if (!kind || kind === "subscription") {
      const { error } = await admin
        .from("pro_subscriptions")
        .delete()
        .in("status", ["pending", "failed"]);
      if (error) errs.push(error.message);
    }

    if (!kind || kind === "error-log") {
      const { error } = await admin
        .from("error_logs")
        .delete()
        .in("source", ["billing/checkout", "billing/checkout-client"]);
      if (error) errs.push(error.message);
    }

    if (errs.length > 0) {
      return NextResponse.json({ error: errs.join("; ") }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cleared: "all" });
  }

  if (!id) {
    return NextResponse.json({ error: "id or all=1 required" }, { status: 400 });
  }

  // Single-row delete — try the indicated table, or both if kind is omitted
  const errs: string[] = [];

  if (!kind || kind === "subscription") {
    const { error } = await admin
      .from("pro_subscriptions")
      .delete()
      .eq("id", id)
      .in("status", ["pending", "failed"]);
    if (error) errs.push(error.message);
  }

  if (!kind || kind === "error-log") {
    const { error } = await admin
      .from("error_logs")
      .delete()
      .eq("id", id)
      .in("source", ["billing/checkout", "billing/checkout-client"]);
    if (error) errs.push(error.message);
  }

  if (errs.length > 0) {
    return NextResponse.json({ error: errs.join("; ") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cleared: id });
}
