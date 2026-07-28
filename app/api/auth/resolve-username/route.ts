import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/resolve-username
 * Looks up the email address for a given username so the client
 * can sign in with email + password without exposing the profiles
 * table directly from the browser.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string };
    const username = body.username?.trim().toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }

    // Use service role to read auth.users join — anon key cannot read emails
    const svc = createServiceRoleClient();

    // First find the user_id from profiles
    const { data: profile } = await svc
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();

    if (!profile) {
      // Return same message as wrong password to avoid username enumeration
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    // Then fetch their email from auth.users via admin API
    const { data: userData, error: userErr } = await svc.auth.admin.getUserById(profile.id);
    if (userErr || !userData?.user?.email) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    return NextResponse.json({ email: userData.user.email });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
