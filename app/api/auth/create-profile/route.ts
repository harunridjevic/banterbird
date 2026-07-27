import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/auth/create-profile
 * Creates or updates the profile row for the currently authenticated user.
 * Uses service role to bypass RLS — safe because we verify the user's
 * session server-side before writing.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { username?: string; metadataOnly?: boolean };
    const username = body.username?.trim();
    if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

    const svc = createServiceRoleClient();

    // metadataOnly = just sync auth metadata, skip profile upsert + uniqueness check
    if (body.metadataOnly) {
      await svc.auth.admin.updateUserById(user.id, { user_metadata: { username } });
      return NextResponse.json({ ok: true });
    }

    // Check username is not already taken by someone else
    const { data: existing } = await svc
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "That username is already taken. Try another." }, { status: 409 });
    }

    const { error: upsertErr } = await svc
      .from("profiles")
      .upsert({ id: user.id, username }, { onConflict: "id" });

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    // Also write username to auth user metadata so it appears in the
    // Supabase Authentication -> Users dashboard panel
    await svc.auth.admin.updateUserById(user.id, {
      user_metadata: { username },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
