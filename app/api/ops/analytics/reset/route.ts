import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, cookieSecret, verifyAnalyticsCookie } from "@/lib/ops/analytics-cookie";
import { analyticsPasswordConfigured } from "@/lib/ops/analytics-password";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST() {
  if (!analyticsPasswordConfigured()) {
    return NextResponse.json({ error: "Analytics is not configured on the server." }, { status: 503 });
  }

  const secret = cookieSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();

    const { data: deleted, error: resetErr } = await admin.rpc("ops_reset_test_data");
    if (resetErr) {
      console.error("ops_reset_test_data", resetErr);
      return NextResponse.json({ error: resetErr.message }, { status: 500 });
    }

    let usersDeleted = 0;
    let page = 1;
    const perPage = 100;

    for (;;) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
      if (listErr) {
        console.error("listUsers", listErr);
        break;
      }
      const users = list?.users ?? [];
      if (users.length === 0) break;

      for (const u of users) {
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        if (!delErr) usersDeleted += 1;
        else console.error("deleteUser", u.id, delErr);
      }

      if (users.length < perPage) break;
      page += 1;
    }

    return NextResponse.json({
      ok: true,
      deleted,
      usersDeleted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Service role key missing (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
