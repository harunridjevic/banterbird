import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, cookieSecret, verifyAnalyticsCookie } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type OpsUserRow = {
  id: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_anonymous: boolean;
};

export async function GET(req: Request) {
  const secret = cookieSecret();
  if (!secret) return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);
  const offset = Number(searchParams.get("offset") ?? "0");
  const search = searchParams.get("q")?.trim() ?? "";

  const svc = createServiceRoleClient();

  // Fetch users from auth.users via admin API (paginated)
  const { data: authData, error: authErr } = await svc.auth.admin.listUsers({
    page: Math.floor(offset / limit) + 1,
    perPage: limit,
  });

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  const users = authData.users;
  const userIds = users.map((u) => u.id);

  // Fetch profiles for these users
  const { data: profiles } = userIds.length > 0
    ? await svc.from("profiles").select("id,username,avatar_url").in("id", userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p: { id: string; username: string | null; avatar_url: string | null }) => [p.id, p]));

  let rows: OpsUserRow[] = users.map((u) => {
    const profile = profileMap.get(u.id);
    const provider = u.app_metadata?.provider ?? "email";
    return {
      id: u.id,
      email: u.email ?? null,
      username: profile?.username ?? (u.user_metadata?.username as string | null) ?? null,
      avatar_url: profile?.avatar_url ?? null,
      provider,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      is_anonymous: u.is_anonymous ?? false,
    };
  });

  // Client-side search filter (admin API doesn't support full-text search)
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.email?.toLowerCase().includes(q) ||
        r.username?.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }

  return NextResponse.json({
    users: rows,
    total: authData.total ?? rows.length,
    hasMore: offset + limit < (authData.total ?? 0),
  });
}
