import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/check-username
 * Returns { available: boolean } for a given username.
 * Uses service role so it works before the user is authenticated.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; currentUserId?: string };
    const username = body.username?.trim();
    if (!username) return NextResponse.json({ available: false });

    const svc = createServiceRoleClient();
    const query = svc
      .from("profiles")
      .select("id")
      .ilike("username", username);

    // Exclude the current user's own row when checking in profile editor
    if (body.currentUserId) query.neq("id", body.currentUserId);

    const { data } = await query.maybeSingle();
    return NextResponse.json({ available: !data });
  } catch {
    return NextResponse.json({ available: false });
  }
}
