import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * GET /api/ops/billing-failures
 * Returns pro_subscriptions rows where status is 'pending' (checkout started but
 * never completed) or 'failed' (payment explicitly failed), newest first.
 * Joined with auth.users via profiles to surface the user's email.
 *
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

  // Count total matching rows
  const { count, error: countErr } = await admin
    .from("pro_subscriptions")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "failed"]);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  // Fetch the page of failed/pending subscription rows
  const { data: subs, error: subsErr } = await admin
    .from("pro_subscriptions")
    .select(
      "id, user_id, status, provider, order_id, paddle_transaction_id, amount_usd, created_at, updated_at",
    )
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }

  const rows = subs ?? [];

  // Enrich with email from profiles (best-effort — if a profile row is missing we fall
  // back to the user_id string so the admin still sees something useful).
  let emailMap: Record<string, string> = {};
  if (rows.length > 0) {
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, username")
      .in("id", userIds);

    for (const p of profiles ?? []) {
      // email column on profiles may not exist — fall back to username
      emailMap[p.id] = (p.email as string | null) ?? (p.username as string | null) ?? p.id;
    }

    // If profiles has no email column, try auth.users via admin.auth.admin.listUsers
    // for the specific IDs that are still unmapped.
    const unmapped = userIds.filter((id) => !emailMap[id]);
    if (unmapped.length > 0) {
      // Supabase doesn't support a direct IN query on auth.users via the JS client,
      // so we fetch each one (max ~25 per page, this is an admin-only low-volume path).
      await Promise.all(
        unmapped.map(async (uid) => {
          try {
            const { data } = await admin.auth.admin.getUserById(uid);
            if (data?.user?.email) {
              emailMap[uid] = data.user.email;
            }
          } catch {
            // ignore — we'll show user_id as fallback
          }
        }),
      );
    }
  }

  const enriched = rows.map((r) => ({
    ...r,
    email: emailMap[r.user_id] ?? null,
  }));

  const total = count ?? 0;
  const hasMore = offset + rows.length < total;

  return NextResponse.json({ rows: enriched, total, hasMore, offset, limit });
}

/**
 * DELETE /api/ops/billing-failures
 * Removes one row (?id=<uuid>) or all failed/pending rows (?all=1).
 *
 * These rows are safe to delete:
 *   - 'pending' rows where the user never finished checkout have no associated
 *     active subscription and pose no billing risk.
 *   - 'failed' rows are already terminal — the payment was rejected.
 *
 * Active ('active') and expired/cancelled rows are explicitly excluded so
 * this endpoint can never accidentally remove meaningful billing history.
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

  const admin = createServiceRoleClient();

  if (clearAll) {
    const { error } = await admin
      .from("pro_subscriptions")
      .delete()
      .in("status", ["pending", "failed"]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cleared: "all" });
  }

  if (!id) {
    return NextResponse.json({ error: "id or all=1 required" }, { status: 400 });
  }

  // Safety: only allow deleting rows that are pending or failed — never active ones.
  const { error } = await admin
    .from("pro_subscriptions")
    .delete()
    .eq("id", id)
    .in("status", ["pending", "failed"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cleared: id });
}
