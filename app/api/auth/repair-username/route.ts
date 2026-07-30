import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * POST /api/auth/repair-username
 *
 * Assigns a username to the currently authenticated user if they don't have
 * one. Intended as a self-healing call for Google OAuth users whose username
 * was not set during the auth callback (e.g. accounts created before the
 * upsert fix, or edge-cases where the callback profile row didn't exist yet).
 *
 * Safe to call repeatedly — if the user already has a username it returns
 * immediately without making any changes.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceRoleClient();

    // Re-check server-side in case the client's cached view is stale.
    const { data: existing } = await svc
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (existing?.username) {
      // Already has one — nothing to do.
      return NextResponse.json({ ok: true, username: existing.username });
    }

    // Derive a base username from the user's email.
    const email = user.email ?? user.user_metadata?.email as string | undefined;
    const base = (email ?? "")
      .split("@")[0]!
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24);

    const safeBase = base || "user";

    let username = safeBase;
    let attempt = 0;

    // Try base, then base_2, base_3 … base_10, then a random hex suffix.
    while (attempt < 10) {
      const { data: taken } = await svc
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .maybeSingle();
      if (!taken) break;
      attempt++;
      username = `${safeBase}_${attempt + 1}`;
    }

    if (attempt === 10) {
      const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
      username = `${safeBase.slice(0, 20)}_${rand}`;
    }

    const { error: upsertErr } = await svc
      .from("profiles")
      .upsert({ id: user.id, username }, { onConflict: "id" });

    if (upsertErr) {
      console.error("[repair-username] upsert failed:", upsertErr.message);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Keep auth metadata in sync.
    await svc.auth.admin.updateUserById(user.id, {
      user_metadata: { username },
    });

    return NextResponse.json({ ok: true, username });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
