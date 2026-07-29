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
  const search = searchParams.get("q")?.trim() ?? "";

  const svc = createServiceRoleClient();

  // Fetch ALL users across all pages (admin API pages at 1000/page max)
  // We do this so we can filter client-side and return accurate counts.
  let allUsers: Awaited<ReturnType<typeof svc.auth.admin.listUsers>>["data"]["users"] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    allUsers = [...allUsers, ...data.users];
    if (data.users.length < perPage) break;
    page++;
    if (page > 20) break; // safety cap at 20k users
  }

  // Keep only real registered accounts:
  // - Has an email address (anonymous sessions never have one)
  // - Provider is not just "anonymous"
  const registeredUsers = allUsers.filter((u) => {
    const provider = (u.app_metadata?.provider as string | undefined) ?? "";
    const hasEmail = typeof u.email === "string" && u.email.trim().length > 0;
    const isAnon = provider === "anonymous" || (u.is_anonymous === true && !hasEmail);
    return hasEmail && !isAnon;
  });

  const userIds = registeredUsers.map((u) => u.id);

  // Fetch profiles
  const { data: profiles } = userIds.length > 0
    ? await svc.from("profiles").select("id,username,avatar_url").in("id", userIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; username: string | null; avatar_url: string | null }) => [p.id, p])
  );

  let rows: OpsUserRow[] = registeredUsers.map((u) => {
    const profile = profileMap.get(u.id);
    const provider = (u.app_metadata?.provider as string | undefined) ?? "email";
    // Prefer profile row username; fall back to auth metadata username.
    // Use || instead of ?? so a null/empty profile username still falls
    // through to the metadata value (email-only accounts may not have a
    // profile row yet, or their profile username column may be null while
    // the username is stored in user_metadata by create-profile).
    const username =
      (profile?.username || null) ??
      ((u.user_metadata?.username as string | undefined) || null);

    return {
      id: u.id,
      email: u.email ?? null,
      username,
      avatar_url: profile?.avatar_url ?? null,
      provider,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      is_anonymous: false,
    };
  });

  // Sort newest first
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Search filter
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
    total: rows.length,
    hasMore: false,
  });
}
