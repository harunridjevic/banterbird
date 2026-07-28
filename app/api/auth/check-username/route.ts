import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/check-username
 * Returns { available: boolean } for a given username.
 * Requires an authenticated session to prevent username enumeration.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { username?: string; currentUserId?: string };
    const username = body.username?.trim();
    if (!username) return NextResponse.json({ available: false });

    const svc = createServiceRoleClient();
    const query = svc
      .from("profiles")
      .select("id")
      .ilike("username", username);

    // Exclude the current user's own row when checking in profile editor.
    // Only trust currentUserId if it matches the authenticated session.
    if (body.currentUserId && body.currentUserId === user.id) {
      query.neq("id", body.currentUserId);
    }

    const { data } = await query.maybeSingle();
    return NextResponse.json({ available: !data });
  } catch {
    return NextResponse.json({ available: false });
  }
}
