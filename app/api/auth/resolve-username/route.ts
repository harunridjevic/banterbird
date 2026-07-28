import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/resolve-username
 * Looks up the email address for a given username so the client
 * can sign in with email + password without exposing the profiles
 * table directly from the browser.
 *
 * Restricted to anonymous sessions only — named (already signed-in)
 * users have no legitimate reason to resolve someone else's email.
 */
export async function POST(req: Request) {
  try {
    // Require a valid Supabase session (anon or named).
    // This prevents unauthenticated scripts from enumerating emails.
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Named (non-anonymous) users should never need to resolve a username
    // to an email — that's only needed during the sign-in flow.
    const isAnon = (user as { is_anonymous?: boolean }).is_anonymous ?? false;
    const isNamed = !isAnon;
    if (isNamed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { username?: string };
    const username = body.username?.trim().toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    const { data: profile } = await svc
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

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
